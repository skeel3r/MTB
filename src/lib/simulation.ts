import { GameState, GameAction, SimulationConfig, SimulationResult, ObstacleType, CardSymbol, TechniqueType } from './types';
import { initWasmEngine, isWasmReady, initGame, advancePhase, processAction, getStandings, sortByShredRandomTies, runIsmcts } from './wasm-engine';
import {
  getTechniqueSymbol, getObstacleSymbols, getObstacleMatchMode, getObstacleName,
  getTrailStageName, getTrailStageSpeedLimit, getTrailStageCheckedRows, getTrailStageTargetLanes,
  ALL_OBSTACLE_TYPES, OBSTACLE_PROPERTIES,
} from './cards';
import { smartAiPlaySprint, smartAiCommit } from './smart-ai';

type Strategy = SimulationConfig['strategy'];

// ── MCTS WASM integration (consolidated via wasm-engine) ──

/** @deprecated Use initWasmEngine() from wasm-engine.ts directly. Kept for backward compat. */
export const ensureMctsWasm = initWasmEngine;

const MCTS_ITERATIONS = 500;

/** MCTS AI: use Rust WASM ISMCTS for commitment decision */
function mctsCommit(state: GameState, playerIndex: number): GameState {
  if (!isWasmReady()) throw new Error('WASM engine not initialized. Call initWasmEngine() first.');
  const stateForMcts = { ...state, currentPlayerIndex: playerIndex };
  const action = runIsmcts(stateForMcts, playerIndex, MCTS_ITERATIONS);
  if ('error' in action) {
    // Fallback to main line on error
    return processAction(state, playerIndex, { type: 'commit_line', payload: { line: 'main' } });
  }
  return processAction(state, playerIndex, action);
}

/** MCTS AI: use Rust WASM ISMCTS for sprint turn */
function mctsPlaySprint(state: GameState, playerIndex: number): GameState {
  if (!isWasmReady()) throw new Error('WASM engine not initialized. Call initWasmEngine() first.');
  let s = state;
  let safety = 50; // prevent infinite loops
  while (!s.players[playerIndex].turnEnded && !s.players[playerIndex].crashed && safety-- > 0) {
    const stateForMcts = { ...s, currentPlayerIndex: playerIndex };
    const action = runIsmcts(stateForMcts, playerIndex, MCTS_ITERATIONS);
    if ('error' in action) {
      // Fallback: end turn on error
      s = processAction(s, playerIndex, { type: 'end_turn' });
      break;
    }
    s = processAction(s, playerIndex, action);
  }
  if (!s.players[playerIndex].turnEnded) {
    s = processAction(s, playerIndex, { type: 'end_turn' });
  }
  return s;
}

/**
 * Aggressive commitment: choose pro line when we can reasonably accomplish it.
 */
function aggressiveCommitLine(state: GameState, playerIndex: number): 'main' | 'pro' {
  const player = state.players[playerIndex];
  const handSize = player.hand.length;
  const momentum = player.momentum;

  // Count distinct symbols in hand
  const symbolSet = new Set(player.hand.map(c => getTechniqueSymbol(c)));
  const diversity = symbolSet.size;

  const canMatch = handSize >= 3 && diversity >= 2;
  const canSendIt = momentum >= 3;
  const lowRisk = player.hazardDice <= 3;

  if ((canMatch || canSendIt) && lowRisk) return 'pro';
  return 'main';
}

/** Check if hand can match obstacle (supports "Forced Through" wild matching) */
function canMatchObstacle(
  hand: TechniqueType[],
  obstacle: ObstacleType,
): boolean {
  const symbols = getObstacleSymbols(obstacle);
  const matchMode = getObstacleMatchMode(obstacle);
  const usedIndices = new Set<number>();

  if (matchMode === 'any') {
    // Exact match
    if (symbols.some(sym => hand.some((c, i) => getTechniqueSymbol(c) === sym && !usedIndices.has(i) && (usedIndices.add(i), true)))) {
      return true;
    }
    // Wild: any 2 cards of same symbol
    const counts: Record<string, number> = {};
    for (const c of hand) counts[getTechniqueSymbol(c)] = (counts[getTechniqueSymbol(c)] || 0) + 1;
    return Object.values(counts).some(n => n >= 2);
  }

  // mode === 'all': exact matches first, then wilds for remainder
  const unmatched: string[] = [];
  for (const sym of symbols) {
    const idx = hand.findIndex((c, i) => getTechniqueSymbol(c) === sym && !usedIndices.has(i));
    if (idx >= 0) usedIndices.add(idx);
    else unmatched.push(sym);
  }
  if (unmatched.length === 0) return true;

  // "Forced Through": 2 same-symbol cards = 1 wild match
  for (const _sym of unmatched) {
    const avail: Record<string, number[]> = {};
    for (let i = 0; i < hand.length; i++) {
      if (usedIndices.has(i)) continue;
      const s = getTechniqueSymbol(hand[i]);
      if (!avail[s]) avail[s] = [];
      avail[s].push(i);
    }
    let found = false;
    for (const indices of Object.values(avail)) {
      if (indices.length >= 2) {
        usedIndices.add(indices[0]);
        usedIndices.add(indices[1]);
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function resolveActiveObstacles(state: GameState, playerIndex: number): GameState {
  let s = state;
  while (s.activeObstacles.length > 0 && !s.players[playerIndex].crashed && !s.players[playerIndex].turnEnded) {
    const obs = s.activeObstacles[0];
    const player = s.players[playerIndex];
    const hasMatch = canMatchObstacle(player.hand, obs);

    if (hasMatch) {
      s = processAction(s, playerIndex, {
        type: 'resolve_obstacle',
        payload: { obstacleIndex: 0 },
      });
    } else {
      s = processAction(s, playerIndex, {
        type: 'send_it',
        payload: { obstacleIndex: 0 },
      });
    }
  }
  return s;
}

/**
 * Trail Read: try to reuse revealed obstacles the player can match.
 */
function tryReuseRevealed(state: GameState, playerIndex: number, maxReuse: number): { state: GameState; reused: number } {
  let s = state;
  let reused = 0;
  const p = () => s.players[playerIndex];

  if (p().drewFreshObstacle) return { state: s, reused: 0 };

  for (let attempt = 0; attempt < maxReuse && !p().crashed && !p().turnEnded; attempt++) {
    const revealed = s.roundRevealedObstacles;
    const hand = p().hand;
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < revealed.length; i++) {
      const obs = revealed[i];
      if (!canMatchObstacle(hand, obs)) continue;

      const mode = getObstacleMatchMode(obs);
      const symbols = getObstacleSymbols(obs);

      let score = 10;
      if (mode === 'any') score += 3;
      if (symbols.length === 1) score += 2;

      const symbolCounts: Record<string, number> = {};
      for (const c of hand) {
        const sym = getTechniqueSymbol(c);
        symbolCounts[sym] = (symbolCounts[sym] || 0) + 1;
      }
      for (const sym of symbols) {
        const count = symbolCounts[sym] || 0;
        if (count >= 2) score += 1;
        if (count <= 1 && mode === 'all') score -= 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;

    s = processAction(s, playerIndex, { type: 'reuse_obstacle', payload: { revealedIndex: bestIdx } });
    s = resolveActiveObstacles(s, playerIndex);
    reused++;
  }

  return { state: s, reused };
}

function aiTakeTurn(state: GameState, playerIndex: number, strategy: Strategy): GameState {
  let s = { ...state };
  const p = () => s.players[playerIndex];

  // Trail Read: reuse scales with how many player lines are visible
  const linesAvailable = Object.keys(s.playerObstacleLines).length;
  const maxReuse = Math.max(1, linesAvailable);
  const { state: afterReuse, reused } = tryReuseRevealed(s, playerIndex, maxReuse);
  s = afterReuse;

  // Determine how many fresh obstacles to draw
  if (strategy === 'aggressive') {
    const maxFreshAggressive = 5;
    for (let i = 0; i < maxFreshAggressive && !p().crashed && !p().turnEnded; i++) {
      if (p().momentum < 2 && p().hand.length === 0) break;
      s = processAction(s, playerIndex, { type: 'draw_obstacle' });
      s = resolveActiveObstacles(s, playerIndex);
    }
  } else {
    let targetObstacles: number;
    if (strategy === 'conservative') {
      const trailCard = s.activeTrailCard;
      const atSpeedLimit = trailCard ? p().momentum >= getTrailStageSpeedLimit(trailCard) : p().momentum >= 4;
      const hasCards = p().hand.length >= 3;
      const noRevealsAvailable = reused === 0 && s.roundRevealedObstacles.length === 0;
      targetObstacles = (noRevealsAvailable && atSpeedLimit && hasCards) ? 1 : 0;
    } else {
      targetObstacles = Math.max(1, Math.min(2, 1 + linesAvailable));
    }
    const freshNeeded = Math.max(0, targetObstacles - reused);

    for (let i = 0; i < freshNeeded && !p().crashed && !p().turnEnded; i++) {
      s = processAction(s, playerIndex, { type: 'draw_obstacle' });
      s = resolveActiveObstacles(s, playerIndex);
    }
  }

  // Spend actions
  let safety = 20;
  while (p().actionsRemaining > 0 && !p().crashed && !p().turnEnded && safety-- > 0) {
    const player = p();

    if (strategy === 'aggressive') {
      if (!player.cannotPedal) {
        s = processAction(s, playerIndex, { type: 'pedal' });
      } else if (player.hand.length > 0) {
        s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: 0 } });
      } else {
        let steered = false;
        const trailCard = s.activeTrailCard;
        if (trailCard) {
          const checkedRows = getTrailStageCheckedRows(trailCard);
          const targetLanes = getTrailStageTargetLanes(trailCard);
          for (let i = 0; i < checkedRows.length; i++) {
            const row = checkedRows[i];
            const targetLane = targetLanes[i];
            const col = getTokenCol(player.grid, row);
            if (col >= 0 && Math.abs(col - targetLane) > 2) {
              const dir = col > targetLane ? -1 : 1;
              s = processAction(s, playerIndex, { type: 'steer', payload: { row, direction: dir } });
              steered = true;
              break;
            }
          }
        }
        if (!steered) break;
      }
    } else if (strategy === 'conservative') {
      const trailCard = s.activeTrailCard;
      const targetSpeed = trailCard ? getTrailStageSpeedLimit(trailCard) : 4;

      if (player.momentum > targetSpeed && !player.cannotBrake && player.commitment !== 'pro') {
        s = processAction(s, playerIndex, { type: 'brake' });
      } else {
        let steered = false;
        if (trailCard) {
          const checkedRows = getTrailStageCheckedRows(trailCard);
          const targetLanes = getTrailStageTargetLanes(trailCard);
          for (let i = 0; i < checkedRows.length; i++) {
            const row = checkedRows[i];
            const targetLane = targetLanes[i];
            const col = getTokenCol(player.grid, row);
            if (col >= 0 && col !== targetLane) {
              const dir = col > targetLane ? -1 : 1;
              s = processAction(s, playerIndex, { type: 'steer', payload: { row, direction: dir } });
              steered = true;
              break;
            }
          }
        }
        if (!steered) {
          for (let r = 0; r < 6; r++) {
            const col = getTokenCol(player.grid, r);
            if (col >= 0 && col !== 2) {
              const dir = col > 2 ? -1 : 1;
              s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
              steered = true;
              break;
            }
          }
        }
        if (steered) {
          continue;
        }
        if (player.hand.length > 0) {
          s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: 0 } });
        } else if (player.momentum < targetSpeed && !player.cannotPedal) {
          s = processAction(s, playerIndex, { type: 'pedal' });
        } else {
          break;
        }
      }
    } else {
      // Balanced
      let steered = false;
      for (let r = 0; r < 6; r++) {
        const col = getTokenCol(player.grid, r);
        if (col >= 0 && col !== 2) {
          const dir = col > 2 ? -1 : 1;
          s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
          steered = true;
          break;
        }
      }
      if (steered) continue;

      if (player.momentum < 4 && !player.cannotPedal) {
        s = processAction(s, playerIndex, { type: 'pedal' });
      } else if (player.hand.length > 0) {
        s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: 0 } });
      } else if (!player.cannotPedal) {
        s = processAction(s, playerIndex, { type: 'pedal' });
      } else {
        break;
      }
    }
  }

  if (!p().turnEnded) {
    s = processAction(s, playerIndex, { type: 'end_turn' });
  }
  return s;
}

/**
 * Random AI: picks legal actions uniformly at random.
 */
function aiTakeTurnRandom(state: GameState, playerIndex: number): GameState {
  let s = state;
  const p = () => s.players[playerIndex];

  const obsToDraw = Math.floor(Math.random() * 3);
  for (let i = 0; i < obsToDraw && !p().crashed && !p().turnEnded; i++) {
    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
    s = resolveActiveObstacles(s, playerIndex);
  }

  let safety = 20;
  while (p().actionsRemaining > 0 && !p().crashed && !p().turnEnded && safety-- > 0) {
    const player = p();
    const options: (() => GameState)[] = [];

    if (!player.cannotPedal) {
      options.push(() => processAction(s, playerIndex, { type: 'pedal' }));
    }
    if (!player.cannotBrake && player.commitment !== 'pro' && player.momentum > 0) {
      options.push(() => processAction(s, playerIndex, { type: 'brake' }));
    }
    for (let r = 0; r < 6; r++) {
      const col = getTokenCol(player.grid, r);
      if (col >= 0 && col < 4) {
        options.push(() => processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: 1 } }));
      }
      if (col > 0) {
        options.push(() => processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: -1 } }));
      }
    }
    if (player.hand.length > 0) {
      const ci = Math.floor(Math.random() * player.hand.length);
      options.push(() => processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: ci } }));
    }

    if (options.length === 0) break;
    if (Math.random() < 0.1) break;

    s = options[Math.floor(Math.random() * options.length)]();
  }

  if (!p().turnEnded) {
    s = processAction(s, playerIndex, { type: 'end_turn' });
  }
  return s;
}

/**
 * Adaptive AI: checks its standing relative to opponents each turn.
 */
function aiTakeTurnAdaptive(state: GameState, playerIndex: number): GameState {
  let s = { ...state };
  const me = s.players[playerIndex];
  const others = s.players.filter((_, i) => i !== playerIndex);
  const p = () => s.players[playerIndex];

  const myScore = me.obstaclesCleared * 10 + me.shred;
  const bestOther = Math.max(...others.map(p => p.obstaclesCleared * 10 + p.shred));
  const worstOther = Math.min(...others.map(p => p.obstaclesCleared * 10 + p.shred));

  const behind = myScore < worstOther;
  const ahead = myScore > bestOther;

  const linesAvailable = Object.keys(s.playerObstacleLines).length;
  const maxReuse = Math.max(1, linesAvailable);
  const { state: afterReuse, reused } = tryReuseRevealed(s, playerIndex, maxReuse);
  s = afterReuse;

  const targetObstacles = behind ? 2 : ahead ? 1 : Math.max(1, Math.min(2, 1 + linesAvailable));
  const freshNeeded = Math.max(0, targetObstacles - reused);
  for (let i = 0; i < freshNeeded && !p().crashed && !p().turnEnded; i++) {
    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
    s = resolveActiveObstacles(s, playerIndex);
  }

  const momentumTarget = behind ? 4 : ahead ? 3 : 4;
  let safety = 20;
  while (p().actionsRemaining > 0 && !p().crashed && !p().turnEnded && safety-- > 0) {
    const player = p();

    let steered = false;
    for (let r = 0; r < 6; r++) {
      const col = getTokenCol(player.grid, r);
      if (col >= 0 && col !== 2) {
        const dir = col > 2 ? -1 : 1;
        s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
        steered = true;
        break;
      }
    }
    if (steered) continue;

    if (player.hand.length > 0) {
      s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: 0 } });
    } else if (player.momentum < momentumTarget && !player.cannotPedal) {
      s = processAction(s, playerIndex, { type: 'pedal' });
    } else if (ahead && player.momentum > 3 && !player.cannotBrake && player.commitment !== 'pro') {
      s = processAction(s, playerIndex, { type: 'brake' });
    } else if (!player.cannotPedal) {
      s = processAction(s, playerIndex, { type: 'pedal' });
    } else {
      break;
    }
  }

  if (!p().turnEnded) {
    s = processAction(s, playerIndex, { type: 'end_turn' });
  }
  return s;
}



function getTokenCol(grid: boolean[][], row: number): number {
  for (let c = 0; c < 5; c++) {
    if (grid[row][c]) return c;
  }
  return -1;
}

// ── Types for live simulation feedback ──

export interface RoundSnapshot {
  round: number;
  trailName: string;
  players: {
    name: string;
    shred: number;
    momentum: number;
    flow: number;
    hazardDice: number;
    penalties: number;
    hand: number;
    crashed: boolean;
    perfectMatches: number;
  }[];
}

export interface BalanceSummary {
  gamesPlayed: number;
  strategy: string;
  playerCount: number;
  winDistribution: Record<string, number>;
  firstPlayerAdvantage: number;
  avgWinnerShred: number;
  avgLoserShred: number;
  shredSpread: number;
  avgPenaltiesPerGame: number;
  avgCrashesPerGame: number;
  avgPerfectMatches: number;
  avgMomentumAtEnd: number;
  avgFlowAtEnd: number;
  avgHandSizeAtEnd: number;
  shredByRound: number[];
  momentumByRound: number[];
  hazardByRound: number[];
  obstacleMatchRate: number;
  trailCardDifficulty: { name: string; avgPenalties: number; avgShred: number }[];
  warnings: string[];
  playerAverages: { name: string; avgShred: number; avgPerfect: number; avgPenalties: number; avgFlow: number; avgMomentum: number }[];
}

/** Run a single simulated game, collecting per-round snapshots */
export function runSingleGame(
  config: SimulationConfig,
  gameNumber: number,
): { result: SimulationResult; roundSnapshots: RoundSnapshot[] } {
  const playerNames = Array.from({ length: config.playerCount }, (_, i) => `Player ${i + 1}`);
  let state = initGame(playerNames);
  const roundSnapshots: RoundSnapshot[] = [];
  const totalRounds = state.trailLength;

  const useSmartAi = config.strategy === 'smart' || config.strategy === 'balanced';
  const useMcts = config.strategy === 'mcts';

  for (let round = 0; round < totalRounds; round++) {
    state = advancePhase(state); // scroll descent
    state = advancePhase(state); // commitment phase

    for (let i = 0; i < state.players.length; i++) {
      if (useMcts) {
        state = mctsCommit(state, i);
      } else if (useSmartAi) {
        state = smartAiCommit(state, i);
      } else {
        const line = config.strategy === 'aggressive' ? aggressiveCommitLine(state, i) : 'main';
        state = processAction(state, i, { type: 'commit_line', payload: { line } });
      }
    }

    state = advancePhase(state); // environment
    state = advancePhase(state); // preparation
    state = advancePhase(state); // sprint start

    const turnOrder = sortByShredRandomTies(
      state.players.map((p, i) => ({ i, shred: p.shred }))
    ).map(x => x.i);

    for (const pi of turnOrder) {
      if (useMcts) {
        state = mctsPlaySprint(state, pi);
      } else if (useSmartAi) {
        state = smartAiPlaySprint(state, pi);
      } else if (config.strategy === 'random') {
        state = aiTakeTurnRandom(state, pi);
      } else if (config.strategy === 'adaptive') {
        state = aiTakeTurnAdaptive(state, pi);
      } else {
        state = aiTakeTurn(state, pi, config.strategy);
      }
    }

    state = advancePhase(state); // alignment
    state = advancePhase(state); // reckoning

    roundSnapshots.push({
      round: round + 1,
      trailName: state.activeTrailCard ? getTrailStageName(state.activeTrailCard) : '?',
      players: state.players.map(p => ({
        name: p.name,
        shred: p.shred,
        momentum: p.momentum,
        flow: p.flow,
        hazardDice: p.hazardDice,
        penalties: p.penalties.length,
        hand: p.hand.length,
        crashed: p.crashed,
        perfectMatches: p.perfectMatches,
      })),
    });
  }

  state.phase = 'game_over';
  const standings = getStandings(state);

  return {
    result: {
      gameNumber,
      winner: standings[0].name,
      finalStandings: standings.map(s => ({
        name: s.name,
        shred: s.shred,
        perfectMatches: s.perfectMatches,
        penalties: s.penalties,
        flow: s.flow,
        momentum: s.momentum,
        cardsPlayed: s.totalCardsPlayed,
      })),
      totalRounds: state.round,
    },
    roundSnapshots,
  };
}

/**
 * Fast game runner — skips snapshot collection for Monte Carlo.
 */
export function runSingleGameFast(
  config: SimulationConfig,
  gameNumber: number,
): { result: SimulationResult; round5Leader: string | null } {
  const playerNames = Array.from({ length: config.playerCount }, (_, i) => `Player ${i + 1}`);
  let state = initGame(playerNames);
  const totalRounds = state.trailLength;
  let round5Leader: string | null = null;

  const useSmartAi = config.strategy === 'smart' || config.strategy === 'balanced';
  const useMcts = config.strategy === 'mcts';

  for (let round = 0; round < totalRounds; round++) {
    state = advancePhase(state); // scroll descent
    state = advancePhase(state); // commitment phase

    for (let i = 0; i < state.players.length; i++) {
      if (useMcts) {
        state = mctsCommit(state, i);
      } else if (useSmartAi) {
        state = smartAiCommit(state, i);
      } else {
        const line = config.strategy === 'aggressive' ? aggressiveCommitLine(state, i) : 'main';
        state = processAction(state, i, { type: 'commit_line', payload: { line } });
      }
    }

    state = advancePhase(state); // environment
    state = advancePhase(state); // preparation
    state = advancePhase(state); // sprint start

    const turnOrder = sortByShredRandomTies(
      state.players.map((p, i) => ({ i, shred: p.shred }))
    ).map(x => x.i);

    for (const pi of turnOrder) {
      if (useMcts) {
        state = mctsPlaySprint(state, pi);
      } else if (useSmartAi) {
        state = smartAiPlaySprint(state, pi);
      } else if (config.strategy === 'random') {
        state = aiTakeTurnRandom(state, pi);
      } else if (config.strategy === 'adaptive') {
        state = aiTakeTurnAdaptive(state, pi);
      } else {
        state = aiTakeTurn(state, pi, config.strategy);
      }
    }

    state = advancePhase(state); // alignment
    state = advancePhase(state); // reckoning

    if (round === 4) {
      let maxProg = -1;
      let leaderName: string | null = null;
      for (const p of state.players) {
        if (p.shred > maxProg) { maxProg = p.shred; leaderName = p.name; }
      }
      round5Leader = leaderName;
    }
  }

  state.phase = 'game_over';
  const standings = getStandings(state);

  return {
    result: {
      gameNumber,
      winner: standings[0].name,
      finalStandings: standings.map(s => ({
        name: s.name,
        shred: s.shred,
        perfectMatches: s.perfectMatches,
        penalties: s.penalties,
        flow: s.flow,
        momentum: s.momentum,
        cardsPlayed: s.totalCardsPlayed,
      })),
      totalRounds: state.round,
    },
    round5Leader,
  };
}

/** Legacy sync runner */
export function runSimulation(config: SimulationConfig): SimulationResult[] {
  const results: SimulationResult[] = [];
  for (let game = 0; game < config.gamesCount; game++) {
    const { result } = runSingleGame(config, game + 1);
    results.push(result);
  }
  return results;
}

/** Compute comprehensive balance summary */
export function computeBalanceSummary(
  results: SimulationResult[],
  allSnapshots: RoundSnapshot[][],
  config: SimulationConfig,
): BalanceSummary {
  const gamesPlayed = results.length;
  const winDistribution: Record<string, number> = {};
  let totalWinnerShred = 0;
  let totalLoserShred = 0;
  let totalPenalties = 0;
  let totalCrashes = 0;
  let totalPerfectMatches = 0;
  let totalMomentum = 0;
  let totalFlow = 0;
  let totalHandSize = 0;
  let totalPlayers = 0;

  const maxRounds = 20;
  const shredByRound = new Array(maxRounds).fill(0);
  const momentumByRound = new Array(maxRounds).fill(0);
  const hazardByRound = new Array(maxRounds).fill(0);
  const roundCounts = new Array(maxRounds).fill(0);

  const trailStats: Record<string, { penalties: number; shred: number; count: number }> = {};
  const playerTotals: Record<string, { shred: number; perfect: number; penalties: number; flow: number; momentum: number; count: number }> = {};

  for (let g = 0; g < results.length; g++) {
    const r = results[g];
    winDistribution[r.winner] = (winDistribution[r.winner] || 0) + 1;
    totalWinnerShred += r.finalStandings[0].shred;
    totalLoserShred += r.finalStandings[r.finalStandings.length - 1].shred;

    for (const s of r.finalStandings) {
      totalPenalties += s.penalties;
      totalMomentum += s.momentum;
      totalFlow += s.flow;
      totalPerfectMatches += s.perfectMatches;
      totalPlayers++;

      if (!playerTotals[s.name]) {
        playerTotals[s.name] = { shred: 0, perfect: 0, penalties: 0, flow: 0, momentum: 0, count: 0 };
      }
      const pt = playerTotals[s.name];
      pt.shred += s.shred;
      pt.perfect += s.perfectMatches;
      pt.penalties += s.penalties;
      pt.flow += s.flow;
      pt.momentum += s.momentum;
      pt.count++;
    }

    const snapshots = allSnapshots[g] || [];
    for (const snap of snapshots) {
      const ri = snap.round - 1;
      if (ri < 15) {
        for (const p of snap.players) {
          shredByRound[ri] += p.shred;
          momentumByRound[ri] += p.momentum;
          hazardByRound[ri] += p.hazardDice;
          totalHandSize += p.hand;
          if (p.crashed) totalCrashes++;
          roundCounts[ri]++;
        }
        if (!trailStats[snap.trailName]) {
          trailStats[snap.trailName] = { penalties: 0, shred: 0, count: 0 };
        }
        const te = trailStats[snap.trailName];
        for (const p of snap.players) {
          te.penalties += p.penalties;
          te.shred += p.shred;
        }
        te.count += snap.players.length;
      }
    }
  }

  for (let i = 0; i < 15; i++) {
    if (roundCounts[i] > 0) {
      shredByRound[i] /= roundCounts[i];
      momentumByRound[i] /= roundCounts[i];
      hazardByRound[i] /= roundCounts[i];
    }
  }

  const trailCardDifficulty = Object.entries(trailStats)
    .filter(([name]) => name !== '?')
    .map(([name, t]) => ({
      name,
      avgPenalties: t.count > 0 ? t.penalties / t.count : 0,
      avgShred: t.count > 0 ? t.shred / t.count : 0,
    }))
    .sort((a, b) => b.avgPenalties - a.avgPenalties);

  const playerAverages = Object.entries(playerTotals).map(([name, t]) => ({
    name,
    avgShred: t.shred / t.count,
    avgPerfect: t.perfect / t.count,
    avgPenalties: t.penalties / t.count,
    avgFlow: t.flow / t.count,
    avgMomentum: t.momentum / t.count,
  }));

  const p1Wins = winDistribution['Player 1'] || 0;
  const expectedWinRate = 1 / config.playerCount;
  const firstPlayerAdvantage = gamesPlayed > 0 ? (p1Wins / gamesPlayed) - expectedWinRate : 0;

  const avgShredPerPlayer = playerAverages.length > 0 ? playerAverages.reduce((s, p) => s + p.avgShred, 0) / playerAverages.length : 0;
  const obstacleMatchRate = Math.min(1, avgShredPerPlayer / 30);

  const avgWinnerProg = gamesPlayed > 0 ? totalWinnerShred / gamesPlayed : 0;
  const avgLoserProg = gamesPlayed > 0 ? totalLoserShred / gamesPlayed : 0;
  const spread = avgWinnerProg - avgLoserProg;
  const avgPen = totalPlayers > 0 ? totalPenalties / totalPlayers : 0;
  const avgCrashRate = gamesPlayed > 0 ? totalCrashes / (gamesPlayed * config.playerCount * 15) : 0;

  const warnings: string[] = [];
  if (Math.abs(firstPlayerAdvantage) > 0.15)
    warnings.push(`First-player advantage: P1 wins ${((p1Wins / gamesPlayed) * 100).toFixed(0)}% vs expected ${(expectedWinRate * 100).toFixed(0)}%`);
  if (spread < 2)
    warnings.push(`Tight scores (spread ${spread.toFixed(1)}). Games may feel random.`);
  if (spread > 15)
    warnings.push(`Large spread (${spread.toFixed(1)}). Snowball risk \u2014 add catch-up mechanics.`);
  if (avgPen > 3)
    warnings.push(`High penalty rate (${avgPen.toFixed(1)}/player). May be too punishing.`);
  if (avgPen < 0.3)
    warnings.push(`Low penalty rate (${avgPen.toFixed(1)}/player). Hazards may be too lenient.`);
  if (obstacleMatchRate > 0.8)
    warnings.push(`High obstacle match rate (${(obstacleMatchRate * 100).toFixed(0)}%). Obstacles may be too easy.`);
  if (obstacleMatchRate < 0.2)
    warnings.push(`Low obstacle match rate (${(obstacleMatchRate * 100).toFixed(0)}%). Players struggle to match.`);
  if (avgCrashRate > 0.15)
    warnings.push(`High crash rate (${(avgCrashRate * 100).toFixed(1)}%). Consider raising crash threshold.`);
  if (warnings.length === 0)
    warnings.push('No major balance issues detected. Core metrics look healthy.');

  return {
    gamesPlayed,
    strategy: config.strategy,
    playerCount: config.playerCount,
    winDistribution,
    firstPlayerAdvantage,
    avgWinnerShred: avgWinnerProg,
    avgLoserShred: avgLoserProg,
    shredSpread: spread,
    avgPenaltiesPerGame: totalPlayers > 0 ? totalPenalties / gamesPlayed : 0,
    avgCrashesPerGame: gamesPlayed > 0 ? totalCrashes / gamesPlayed : 0,
    avgPerfectMatches: totalPlayers > 0 ? totalPerfectMatches / totalPlayers : 0,
    avgMomentumAtEnd: totalPlayers > 0 ? totalMomentum / totalPlayers : 0,
    avgFlowAtEnd: totalPlayers > 0 ? totalFlow / totalPlayers : 0,
    avgHandSizeAtEnd: totalPlayers > 0 ? totalHandSize / (totalPlayers * 15) : 0,
    shredByRound,
    momentumByRound,
    hazardByRound,
    obstacleMatchRate,
    trailCardDifficulty,
    warnings,
    playerAverages,
  };
}

// ── Monte Carlo Analysis ──

export interface MonteCarloResult {
  totalGames: number;
  seatWinRates: { seat: string; wins: number; rate: number }[];
  strategyWinRates: { strategy: string; wins: number; rate: number; games: number }[];
  convergenceData: { games: number; p1WinRate: number }[];
  p1Confidence: { lower: number; upper: number; mean: number };
  scoreDistribution: {
    winnerAvg: number;
    winnerStdDev: number;
    loserAvg: number;
    loserStdDev: number;
  };
  obstacleMatchRate: number;
  snowballCorrelation: number;
  strategyDominance: string;
  fairnessVerdict: string;
}

/** Run a Monte Carlo convergence test across many games and strategies */
export function runMonteCarlo(
  playerCount: number,
  totalGames: number,
  onProgress?: (done: number, total: number) => void,
): MonteCarloResult {
  const strategies: Strategy[] = ['aggressive', 'smart', 'conservative', 'mcts'];
  const gamesPerStrategy = Math.ceil(totalGames / strategies.length);

  const seatWins: Record<string, number> = {};
  const strategyData: Record<string, { wins: number; games: number }> = {};
  const convergencePoints: { games: number; p1WinRate: number }[] = [];

  let winnerScoreSum = 0, winnerScoreSqSum = 0, winnerCount = 0;
  let loserScoreSum = 0, loserScoreSqSum = 0, loserCount = 0;

  let earlyLeadWinCount = 0;
  let earlyLeadTotal = 0;

  let totalObstaclesCleared = 0;
  let totalObstaclesFlipped = 0;
  let gamesDone = 0;
  let p1Wins = 0;

  const convergenceInterval = Math.max(1, Math.floor(totalGames / 50));

  for (const strategy of strategies) {
    if (!strategyData[strategy]) {
      strategyData[strategy] = { wins: 0, games: 0 };
    }

    for (let g = 0; g < gamesPerStrategy; g++) {
      const config: SimulationConfig = { playerCount, gamesCount: 1, strategy };
      const { result, round5Leader } = runSingleGameFast(config, gamesDone + 1);

      seatWins[result.winner] = (seatWins[result.winner] || 0) + 1;
      strategyData[strategy].wins += 1;
      strategyData[strategy].games++;

      if (result.winner === 'Player 1') p1Wins++;

      const wScore = result.finalStandings[0].shred;
      winnerScoreSum += wScore;
      winnerScoreSqSum += wScore * wScore;
      winnerCount++;
      if (result.finalStandings.length > 1) {
        const lScore = result.finalStandings[result.finalStandings.length - 1].shred;
        loserScoreSum += lScore;
        loserScoreSqSum += lScore * lScore;
        loserCount++;
      }

      for (const s of result.finalStandings) {
        totalObstaclesCleared += s.shred;
        totalObstaclesFlipped += s.shred + s.penalties;
      }

      if (round5Leader) {
        earlyLeadTotal++;
        if (round5Leader === result.winner) earlyLeadWinCount++;
      }

      gamesDone++;

      if (gamesDone % convergenceInterval === 0 || gamesDone === 1) {
        convergencePoints.push({
          games: gamesDone,
          p1WinRate: p1Wins / gamesDone,
        });
      }

      if (onProgress) onProgress(gamesDone, totalGames);
    }
  }

  if (convergencePoints.length === 0 || convergencePoints[convergencePoints.length - 1].games !== gamesDone) {
    convergencePoints.push({ games: gamesDone, p1WinRate: p1Wins / gamesDone });
  }

  const seatWinRates = Array.from({ length: playerCount }, (_, i) => {
    const seat = `Player ${i + 1}`;
    const wins = seatWins[seat] || 0;
    return { seat, wins, rate: wins / gamesDone };
  });

  const strategyWinRates = strategies.map(s => ({
    strategy: s,
    wins: strategyData[s].wins,
    rate: strategyData[s].games > 0 ? strategyData[s].wins / strategyData[s].games : 0,
    games: strategyData[s].games,
  }));

  const p1Rate = p1Wins / gamesDone;
  const z = 1.96;
  const n = gamesDone;
  const denominator = 1 + z * z / n;
  const centre = p1Rate + z * z / (2 * n);
  const spread = z * Math.sqrt((p1Rate * (1 - p1Rate) + z * z / (4 * n)) / n);
  const p1Confidence = {
    lower: Math.max(0, (centre - spread) / denominator),
    upper: Math.min(1, (centre + spread) / denominator),
    mean: p1Rate,
  };

  const wAvg = winnerCount > 0 ? winnerScoreSum / winnerCount : 0;
  const wStdDev = winnerCount > 1
    ? Math.sqrt((winnerScoreSqSum - winnerScoreSum * winnerScoreSum / winnerCount) / (winnerCount - 1))
    : 0;
  const lAvg = loserCount > 0 ? loserScoreSum / loserCount : 0;
  const lStdDev = loserCount > 1
    ? Math.sqrt((loserScoreSqSum - loserScoreSum * loserScoreSum / loserCount) / (loserCount - 1))
    : 0;

  const snowballRate = earlyLeadTotal > 0 ? earlyLeadWinCount / earlyLeadTotal : 0;

  const bestStrat = strategyWinRates.reduce((a, b) => a.rate > b.rate ? a : b);
  const worstStrat = strategyWinRates.reduce((a, b) => a.rate < b.rate ? a : b);
  const dominanceGap = bestStrat.rate - worstStrat.rate;
  const strategyDominance = dominanceGap > 0.15
    ? `${bestStrat.strategy} dominates (${(bestStrat.rate * 100).toFixed(1)}% vs ${(worstStrat.rate * 100).toFixed(1)}%)`
    : 'No dominant strategy detected \u2014 balanced.';

  const expectedRate = 1 / playerCount;
  const maxDeviation = Math.max(...seatWinRates.map(s => Math.abs(s.rate - expectedRate)));
  const fairnessVerdict = maxDeviation < 0.05
    ? 'Excellent fairness \u2014 seat positions are well balanced.'
    : maxDeviation < 0.10
      ? 'Acceptable fairness \u2014 minor seat advantage detected.'
      : `Fairness concern \u2014 seat deviation of ${(maxDeviation * 100).toFixed(1)}% (expected ${(expectedRate * 100).toFixed(0)}%).`;

  return {
    totalGames: gamesDone,
    seatWinRates,
    strategyWinRates,
    convergenceData: convergencePoints,
    p1Confidence,
    scoreDistribution: {
      winnerAvg: wAvg,
      winnerStdDev: wStdDev,
      loserAvg: lAvg,
      loserStdDev: lStdDev,
    },
    obstacleMatchRate: totalObstaclesFlipped > 0 ? totalObstaclesCleared / totalObstaclesFlipped : 0,
    snowballCorrelation: snowballRate,
    strategyDominance,
    fairnessVerdict,
  };
}

// ═══════════════════════════════════════════════════════════
// Agency Analysis — does skill correlate with winning?
// ═══════════════════════════════════════════════════════════

type PerPlayerStrategy = Strategy;

function runMixedStrategyGame(
  strategies: PerPlayerStrategy[],
  gameNumber: number,
): SimulationResult {
  const playerCount = strategies.length;
  const playerNames = strategies.map((s, i) => `Player ${i + 1} (${s})`);
  let state = initGame(playerNames);
  const totalRounds = state.trailLength;

  for (let round = 0; round < totalRounds; round++) {
    state = advancePhase(state);
    state = advancePhase(state);

    for (let i = 0; i < state.players.length; i++) {
      const strat = strategies[i];
      if (strat === 'smart' || strat === 'balanced') {
        state = smartAiCommit(state, i);
      } else {
        const line = strat === 'aggressive' ? aggressiveCommitLine(state, i) : 'main';
        state = processAction(state, i, { type: 'commit_line', payload: { line } });
      }
    }

    state = advancePhase(state);
    state = advancePhase(state);
    state = advancePhase(state);

    const turnOrder = sortByShredRandomTies(
      state.players.map((p, i) => ({ i, shred: p.shred }))
    ).map(x => x.i);

    for (const pi of turnOrder) {
      const strat = strategies[pi];
      if (strat === 'smart' || strat === 'balanced') {
        state = smartAiPlaySprint(state, pi);
      } else if (strat === 'random') {
        state = aiTakeTurnRandom(state, pi);
      } else if (strat === 'adaptive') {
        state = aiTakeTurnAdaptive(state, pi);
      } else {
        state = aiTakeTurn(state, pi, strat);
      }
    }

    state = advancePhase(state);
    state = advancePhase(state);
  }

  state.phase = 'game_over';
  const standings = getStandings(state);

  return {
    gameNumber,
    winner: standings[0].name,
    finalStandings: standings.map(s => ({
      name: s.name,
      shred: s.shred,
      perfectMatches: s.perfectMatches,
      penalties: s.penalties,
      flow: s.flow,
      momentum: s.momentum,
      cardsPlayed: s.totalCardsPlayed,
    })),
    totalRounds: state.round,
  };
}

export interface AgencyResult {
  totalGames: number;
  strategyWinRates: { strategy: string; wins: number; games: number; winRate: number }[];
  strategyAvgShred: { strategy: string; avgShred: number }[];
  headToHead: { opponent: string; smartWinRate: number; opponentWinRate: number; games: number }[];
  skillGap: number;
  decisionQualityCorrelation: number;
  perfectMatchCorrelation: number;
  verdict: string;
}

export function runAgencyAnalysis(
  gamesPerMatchup: number,
  onProgress?: (done: number, total: number) => void,
): AgencyResult {
  const strategyWins: Record<string, { wins: number; games: number; totalShred: number }> = {};
  const headToHead: Record<string, { smartWins: number; opponentWins: number; games: number }> = {};

  const decisionQualityData: { obstaclesCleared: number; rank: number }[] = [];
  const perfectMatchData: { perfectMatches: number; rank: number }[] = [];

  const matchups: { label: string; strategies: PerPlayerStrategy[] }[] = [
    { label: 'conservative', strategies: ['smart', 'conservative', 'conservative', 'conservative'] },
    { label: 'aggressive', strategies: ['smart', 'aggressive', 'aggressive', 'aggressive'] },
    { label: 'random', strategies: ['smart', 'random', 'random', 'random'] },
    { label: 'adaptive', strategies: ['smart', 'adaptive', 'adaptive', 'adaptive'] },
    { label: 'mixed', strategies: ['smart', 'aggressive', 'conservative', 'random'] },
    { label: 'full-mixed', strategies: ['smart', 'adaptive', 'aggressive', 'conservative'] },
  ];

  const totalWork = matchups.length * 4 * gamesPerMatchup;
  let done = 0;

  function initStrategy(s: string) {
    if (!strategyWins[s]) strategyWins[s] = { wins: 0, games: 0, totalShred: 0 };
  }

  for (const matchup of matchups) {
    if (!headToHead[matchup.label]) {
      headToHead[matchup.label] = { smartWins: 0, opponentWins: 0, games: 0 };
    }

    for (let seat = 0; seat < 4; seat++) {
      const rotated = [...matchup.strategies];
      const smartStrat = rotated.splice(0, 1)[0];
      rotated.splice(seat, 0, smartStrat);

      for (let g = 0; g < gamesPerMatchup; g++) {
        const result = runMixedStrategyGame(rotated, done + 1);

        for (let pi = 0; pi < result.finalStandings.length; pi++) {
          const strat = rotated[pi];
          const standing = result.finalStandings.find(s => s.name === `Player ${pi + 1} (${strat})`);
          if (!standing) continue;

          initStrategy(strat);
          strategyWins[strat].games++;
          strategyWins[strat].totalShred += standing.shred;

          const rank = result.finalStandings.indexOf(standing);
          if (rank === 0) strategyWins[strat].wins++;

          decisionQualityData.push({ obstaclesCleared: standing.shred, rank });
          perfectMatchData.push({ perfectMatches: standing.perfectMatches, rank });
        }

        const h2h = headToHead[matchup.label];
        h2h.games++;
        const winnerStrat = rotated[result.finalStandings.findIndex(s => s.name === result.winner) >= 0
          ? (() => {
            for (let pi = 0; pi < rotated.length; pi++) {
              if (result.finalStandings[0].name === `Player ${pi + 1} (${rotated[pi]})`) return pi;
            }
            return 0;
          })()
          : 0];
        if (winnerStrat === 'smart' || winnerStrat === 'balanced') {
          h2h.smartWins++;
        } else {
          h2h.opponentWins++;
        }

        done++;
        if (onProgress) onProgress(done, totalWork);
      }
    }
  }

  const strategies = ['smart', 'adaptive', 'aggressive', 'conservative', 'random'];
  const strategyWinRates = strategies.map(s => {
    const d = strategyWins[s] || { wins: 0, games: 0, totalShred: 0 };
    return { strategy: s, wins: d.wins, games: d.games, winRate: d.games > 0 ? d.wins / d.games : 0 };
  });

  const strategyAvgShred = strategies.map(s => {
    const d = strategyWins[s] || { totalShred: 0, games: 0 };
    return { strategy: s, avgShred: d.games > 0 ? d.totalShred / d.games : 0 };
  });

  const h2hResults = Object.entries(headToHead).map(([opponent, data]) => ({
    opponent,
    smartWinRate: data.games > 0 ? data.smartWins / data.games : 0,
    opponentWinRate: data.games > 0 ? data.opponentWins / data.games : 0,
    games: data.games,
  }));

  const smartWR = strategyWinRates.find(s => s.strategy === 'smart')?.winRate || 0;
  const randomWR = strategyWinRates.find(s => s.strategy === 'random')?.winRate || 0;
  const skillGap = randomWR < 1 ? Math.max(0, Math.min(1, (smartWR - randomWR) / (1 - randomWR))) : 0;

  const decisionQualityCorrelation = spearmanCorrelation(
    decisionQualityData.map(d => d.obstaclesCleared),
    decisionQualityData.map(d => -d.rank),
  );

  const perfectMatchCorrelation = spearmanCorrelation(
    perfectMatchData.map(d => d.perfectMatches),
    perfectMatchData.map(d => -d.rank),
  );

  let verdict: string;
  if (skillGap >= 0.4) {
    verdict = `Strong agency (skill gap ${(skillGap * 100).toFixed(0)}%) \u2014 better strategy strongly predicts winning.`;
  } else if (skillGap >= 0.2) {
    verdict = `Moderate agency (skill gap ${(skillGap * 100).toFixed(0)}%) \u2014 strategy matters but luck plays a significant role.`;
  } else if (skillGap >= 0.1) {
    verdict = `Weak agency (skill gap ${(skillGap * 100).toFixed(0)}%) \u2014 skill has some impact but outcomes feel mostly random.`;
  } else {
    verdict = `Minimal agency (skill gap ${(skillGap * 100).toFixed(0)}%) \u2014 strategy barely matters.`;
  }

  return {
    totalGames: done,
    strategyWinRates,
    strategyAvgShred,
    headToHead: h2hResults,
    skillGap,
    decisionQualityCorrelation,
    perfectMatchCorrelation,
    verdict,
  };
}

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  function rankArray(arr: number[]): number[] {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && indexed[j + 1].v === indexed[j].v) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
      i = j + 1;
    }
    return ranks;
  }

  const rx = rankArray(x);
  const ry = rankArray(y);

  const meanRx = rx.reduce((s, v) => s + v, 0) / n;
  const meanRy = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanRx;
    const dy = ry[i] - meanRy;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}

// ═══════════════════════════════════════════════════════════
// Theoretical Obstacle Match Probability
// ═══════════════════════════════════════════════════════════

const _chooseCache = new Map<number, number>();
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = k < n - k ? k : n - k;
  const key = n * 1000 + kk;
  const cached = _chooseCache.get(key);
  if (cached !== undefined) return cached;
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = result * (n - i) / (i + 1);
  }
  const val = Math.round(result);
  _chooseCache.set(key, val);
  return val;
}

function pAtLeastOne(N: number, K: number, h: number): number {
  return 1 - choose(N - K, h) / choose(N, h);
}

function pAtLeastOneOfEither(N: number, Ka: number, Kb: number, h: number): number {
  const pNeither = choose(N - Ka - Kb, h) / choose(N, h);
  return 1 - pNeither;
}

export interface ObstacleMatchProbability {
  name: string;
  symbols: string[];
  matchMode: 'all' | 'any';
  byHandSize: { handSize: number; probability: number }[];
  weightedAvg: number;
}

export function computeObstacleMatchProbabilities(): ObstacleMatchProbability[] {
  const N = 52;
  const symbolCounts: Record<string, number> = { grip: 17, air: 17, agility: 9, balance: 9 };

  const handWeights: Record<number, number> = { 2: 0.15, 3: 0.25, 4: 0.30, 5: 0.20, 6: 0.10 };

  return ALL_OBSTACLE_TYPES.map(obsType => {
    const props = OBSTACLE_PROPERTIES[obsType];
    const mode = props.matchMode ?? 'all';
    const symbols = props.symbols;
    const byHandSize: { handSize: number; probability: number }[] = [];

    for (let h = 2; h <= 6; h++) {
      let prob: number;

      if (mode === 'any') {
        if (symbols.length === 2) {
          prob = pAtLeastOneOfEither(N, symbolCounts[symbols[0]], symbolCounts[symbols[1]], h);
        } else {
          prob = pAtLeastOne(N, symbolCounts[symbols[0]], h);
        }
      } else {
        if (symbols.length === 1) {
          prob = pAtLeastOne(N, symbolCounts[symbols[0]], h);
        } else {
          const Ka = symbolCounts[symbols[0]];
          const Kb = symbolCounts[symbols[1]];
          const pMissA = choose(N - Ka, h) / choose(N, h);
          const pMissB = choose(N - Kb, h) / choose(N, h);
          const pMissBoth = choose(N - Ka - Kb, h) / choose(N, h);
          prob = 1 - pMissA - pMissB + pMissBoth;
        }
      }

      byHandSize.push({ handSize: h, probability: prob });
    }

    const weightedAvg = byHandSize.reduce(
      (sum, entry) => sum + entry.probability * (handWeights[entry.handSize] || 0), 0,
    );

    return { name: props.name, symbols: [...symbols], matchMode: mode, byHandSize, weightedAvg };
  });
}

// ═══════════════════════════════════════════════════════════
// Gini Coefficient
// ═══════════════════════════════════════════════════════════

function giniCoefficient(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;

  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

export interface GiniAnalysis {
  shredGini: number;
  momentumGini: number;
  flowGini: number;
  penaltyGini: number;
  shredGiniByRound: number[];
  verdict: string;
}

export function computeGiniAnalysis(
  results: SimulationResult[],
  allSnapshots: RoundSnapshot[][],
): GiniAnalysis {
  const allShred: number[] = [];
  const allMomentum: number[] = [];
  const allFlow: number[] = [];
  const allPenalties: number[] = [];

  for (const r of results) {
    for (const s of r.finalStandings) {
      allShred.push(s.shred);
      allMomentum.push(s.momentum);
      allFlow.push(s.flow);
      allPenalties.push(s.penalties);
    }
  }

  const shredGini = giniCoefficient(allShred);
  const momentumGini = giniCoefficient(allMomentum);
  const flowGini = giniCoefficient(allFlow);
  const penaltyGini = giniCoefficient(allPenalties);

  const maxRoundsGini = 20;
  const shredGiniByRound: number[] = [];
  for (let round = 0; round < maxRoundsGini; round++) {
    const roundShred: number[] = [];
    for (const snaps of allSnapshots) {
      if (snaps[round]) {
        for (const p of snaps[round].players) {
          roundShred.push(p.shred);
        }
      }
    }
    shredGiniByRound.push(giniCoefficient(roundShred));
  }

  let verdict: string;
  if (shredGini < 0.1) {
    verdict = 'Very equal \u2014 players finish with similar scores.';
  } else if (shredGini < 0.2) {
    verdict = 'Healthy inequality \u2014 meaningful gaps without runaway leaders.';
  } else if (shredGini < 0.35) {
    verdict = 'Moderate inequality \u2014 some players fall significantly behind.';
  } else {
    verdict = 'High inequality \u2014 large gaps between leaders and laggards.';
  }

  return { shredGini, momentumGini, flowGini, penaltyGini, shredGiniByRound, verdict };
}

// ═══════════════════════════════════════════════════════════
// Sensitivity Analysis
// ═══════════════════════════════════════════════════════════

export interface SensitivityParam {
  id: string;
  label: string;
  baseValue: number;
  testValues: number[];
  unit: string;
}

export interface SensitivityResult {
  param: SensitivityParam;
  outcomes: {
    value: number;
    avgWinnerShred: number;
    avgPenalties: number;
    avgCrashes: number;
    shredSpread: number;
    obstacleMatchRate: number;
  }[];
}

export const SENSITIVITY_PARAMS: SensitivityParam[] = [
  { id: 'handSizeMin', label: 'Min Hand Size', baseValue: 2, testValues: [1, 2, 3, 4], unit: 'cards' },
  { id: 'handSizeMax', label: 'Max Hand Size', baseValue: 6, testValues: [4, 5, 6, 7, 8], unit: 'cards' },
  { id: 'crashThreshold', label: 'Crash Threshold', baseValue: 6, testValues: [4, 5, 6, 7, 8], unit: 'dice' },
  { id: 'hazardTrigger', label: 'Hazard Roll Trigger', baseValue: 6, testValues: [5, 6], unit: 'roll value' },
  { id: 'symbolsPerType', label: 'Cards per Symbol', baseValue: 5, testValues: [3, 4, 5, 6, 7], unit: 'cards' },
];

export function runSensitivityAnalysis(
  playerCount: number,
  gamesPerValue: number,
  onProgress?: (done: number, total: number) => void,
): SensitivityResult[] {
  const results: SensitivityResult[] = [];
  const totalWork = SENSITIVITY_PARAMS.reduce((s, p) => s + p.testValues.length, 0) * gamesPerValue;
  let done = 0;

  for (const param of SENSITIVITY_PARAMS) {
    const outcomes: SensitivityResult['outcomes'] = [];

    for (const value of param.testValues) {
      let totalWinnerProg = 0;
      let totalPenalties = 0;
      let totalCrashes = 0;
      let totalWinnerSpread = 0;
      let totalObsCleared = 0;
      let totalObsFlipped = 0;

      for (let g = 0; g < gamesPerValue; g++) {
        const config: SimulationConfig = { playerCount, gamesCount: 1, strategy: 'balanced' };
        const { result } = runSingleGameWithOverride(config, g + 1, param.id, value);

        totalWinnerProg += result.finalStandings[0].shred;
        const loserProg = result.finalStandings[result.finalStandings.length - 1].shred;
        totalWinnerSpread += result.finalStandings[0].shred - loserProg;

        for (const s of result.finalStandings) {
          totalPenalties += s.penalties;
          totalObsCleared += s.shred;
          totalObsFlipped += s.shred + s.penalties;
        }

        done++;
        if (onProgress) onProgress(done, totalWork);
      }

      outcomes.push({
        value,
        avgWinnerShred: totalWinnerProg / gamesPerValue,
        avgPenalties: totalPenalties / (gamesPerValue * playerCount),
        avgCrashes: totalCrashes / gamesPerValue,
        shredSpread: totalWinnerSpread / gamesPerValue,
        obstacleMatchRate: totalObsFlipped > 0 ? totalObsCleared / totalObsFlipped : 0,
      });
    }

    results.push({ param, outcomes });
  }

  return results;
}

function runSingleGameWithOverride(
  config: SimulationConfig,
  gameNumber: number,
  paramId: string,
  value: number,
): { result: SimulationResult } {
  const playerNames = Array.from({ length: config.playerCount }, (_, i) => `Player ${i + 1}`);
  let state = initGame(playerNames);

  // Apply overrides to initial state
  if (paramId === 'symbolsPerType') {
    // Rebuild technique deck with different card counts per symbol
    const allTypes: TechniqueType[] = ['inside_line', 'manual', 'flick', 'recover', 'pump', 'whip'];
    const deck: TechniqueType[] = [];
    for (const type of allTypes) {
      for (let i = 0; i < value; i++) {
        deck.push(type);
      }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.techniqueDeck = deck;
  }

  for (let round = 0; round < state.trailLength; round++) {
    state = advancePhase(state);
    state = advancePhase(state);
    for (let i = 0; i < state.players.length; i++) {
      state = smartAiCommit(state, i);
    }
    state = advancePhase(state);
    state = advancePhase(state);

    // Apply hand size overrides after preparation draws
    if (paramId === 'handSizeMin' || paramId === 'handSizeMax') {
      for (const player of state.players) {
        const minH = paramId === 'handSizeMin' ? value : 2;
        const maxH = paramId === 'handSizeMax' ? value : 6;
        const targetHandSize = Math.max(minH, Math.min(maxH, player.momentum));
        while (player.hand.length > targetHandSize) player.hand.pop();
        while (player.hand.length < targetHandSize) {
          const drawn = state.techniqueDeck.pop();
          if (drawn) player.hand.push(drawn);
          else break;
        }
      }
    }

    state = advancePhase(state);

    const sensTurnOrder = sortByShredRandomTies(
      state.players.map((p, i) => ({ i, shred: p.shred }))
    ).map(x => x.i);
    for (const pi of sensTurnOrder) {
      state = smartAiPlaySprint(state, pi);
    }
    state = advancePhase(state);

    // Apply crash threshold override before reckoning
    if (paramId === 'crashThreshold') {
      for (const player of state.players) {
        if (player.hazardDice >= value) {
          player.crashed = true;
          player.shred = Math.max(0, player.shred - 2);
        }
      }
    }

    state = advancePhase(state);
  }

  state.phase = 'game_over';
  const standings = getStandings(state);

  return {
    result: {
      gameNumber,
      winner: standings[0].name,
      finalStandings: standings.map(s => ({
        name: s.name,
        shred: s.shred,
        perfectMatches: s.perfectMatches,
        penalties: s.penalties,
        flow: s.flow,
        momentum: s.momentum,
        cardsPlayed: s.totalCardsPlayed,
      })),
      totalRounds: state.round,
    },
  };
}
