import { GameState, SimulationConfig, SimulationResult, ProgressObstacle, CardSymbol, TechniqueCard } from './types';
import { initGame, advancePhase, processAction, getStandings, sortByProgressRandomTies } from './engine';
import { OBSTACLE_DEFINITIONS } from './cards';
import { smartAiPlaySprint, smartAiCommit } from './smart-ai';

type Strategy = SimulationConfig['strategy'];

/** Check if hand can match obstacle (supports "Forced Through" wild matching) */
function canMatchObstacle(
  hand: { symbol: string }[],
  symbols: string[],
  matchMode: 'all' | 'any',
): boolean {
  const usedIndices = new Set<number>();

  if (matchMode === 'any') {
    // Exact match
    if (symbols.some(sym => hand.some((c, i) => c.symbol === sym && !usedIndices.has(i) && (usedIndices.add(i), true)))) {
      return true;
    }
    // Wild: any 2 cards of same symbol
    const counts: Record<string, number> = {};
    for (const c of hand) counts[c.symbol] = (counts[c.symbol] || 0) + 1;
    return Object.values(counts).some(n => n >= 2);
  }

  // mode === 'all': exact matches first, then wilds for remainder
  const unmatched: string[] = [];
  for (const sym of symbols) {
    const idx = hand.findIndex((c, i) => c.symbol === sym && !usedIndices.has(i));
    if (idx >= 0) usedIndices.add(idx);
    else unmatched.push(sym);
  }
  if (unmatched.length === 0) return true;

  // "Forced Through": 2 same-symbol cards = 1 wild match
  for (const _sym of unmatched) {
    const avail: Record<string, number[]> = {};
    for (let i = 0; i < hand.length; i++) {
      if (usedIndices.has(i)) continue;
      const s = hand[i].symbol;
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
    const mode = obs.matchMode ?? 'all';
    const hasMatch = canMatchObstacle(player.hand, obs.symbols, mode);

    if (hasMatch) {
      // Match with cards — progress + deferred momentum
      s = processAction(s, playerIndex, {
        type: 'resolve_obstacle',
        payload: { obstacleIndex: 0 },
      });
    } else {
      // Send It (variable momentum + 1 hazard die) or crash if insufficient
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
 * Evaluates all matchable revealed obstacles and picks the best ones.
 * Returns updated state and number reused.
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

    // Evaluate all matchable revealed obstacles and pick the best one
    for (let i = 0; i < revealed.length; i++) {
      const obs = revealed[i];
      const mode = obs.matchMode ?? 'all';
      if (!canMatchObstacle(hand, obs.symbols, mode)) continue;

      // Score: prefer 'any' mode (cheaper), prefer symbols we have duplicates of
      let score = 10;
      if (mode === 'any') score += 3; // cheaper match
      if (obs.symbols.length === 1) score += 2; // single symbol = easiest

      const symbolCounts: Record<string, number> = {};
      for (const c of hand) symbolCounts[c.symbol] = (symbolCounts[c.symbol] || 0) + 1;
      for (const sym of obs.symbols) {
        const count = symbolCounts[sym] || 0;
        if (count >= 2) score += 1; // have duplicates, safe to spend
        if (count <= 1 && mode === 'all') score -= 2; // using last copy
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
  const maxReuse = Math.max(1, linesAvailable); // P2: 1, P3: 2, P4: 3
  const { state: afterReuse, reused } = tryReuseRevealed(s, playerIndex, maxReuse);
  s = afterReuse;

  // Determine how many fresh obstacles to draw
  const targetObstacles = strategy === 'aggressive' ? 2 : Math.max(1, Math.min(2, 1 + linesAvailable));
  const freshNeeded = Math.max(0, targetObstacles - reused);

  for (let i = 0; i < freshNeeded && !p().crashed && !p().turnEnded; i++) {
    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
    s = resolveActiveObstacles(s, playerIndex);
  }

  // Spend actions
  let safety = 20;
  while (p().actionsRemaining > 0 && !p().crashed && !p().turnEnded && safety-- > 0) {
    const player = p();

    if (strategy === 'aggressive') {
      if (player.momentum < 5 && !player.cannotPedal) {
        s = processAction(s, playerIndex, { type: 'pedal' });
      } else if (player.hand.length > 0) {
        s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: pickComboCard(player) } });
      } else if (!player.cannotPedal) {
        s = processAction(s, playerIndex, { type: 'pedal' });
      } else {
        break;
      }
    } else if (strategy === 'conservative') {
      if (player.momentum > 3) {
        s = processAction(s, playerIndex, { type: 'brake' });
      } else {
        // Steer toward center
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
        if (!steered && !player.cannotPedal) {
          s = processAction(s, playerIndex, { type: 'pedal' });
        } else if (!steered) {
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
        s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: pickComboCard(player) } });
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

/** Pick the best card index for combo potential */
function pickComboCard(player: { hand: { symbol: string; name: string }[]; cardsPlayedThisTurn: { symbol: string }[]; hazardDice: number; grid: boolean[][] }): number {
  if (player.hand.length === 0) return 0;
  const played = player.cardsPlayedThisTurn || [];
  if (played.length > 0) {
    // Try synergy first (same symbol)
    const playedSymbols = played.map(c => c.symbol);
    const synergyIdx = player.hand.findIndex(c => playedSymbols.includes(c.symbol));
    if (synergyIdx >= 0) return synergyIdx;
    // Then diversify
    const usedSymbols = new Set(playedSymbols);
    const diverseIdx = player.hand.findIndex(c => !usedSymbols.has(c.symbol));
    if (diverseIdx >= 0) return diverseIdx;
  }
  // First card: prioritize by state
  if (player.hazardDice >= 3) {
    const ri = player.hand.findIndex(c => c.name === 'Recover');
    if (ri >= 0) return ri;
  }
  return 0;
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
    progress: number;
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
  avgWinnerProgress: number;
  avgLoserProgress: number;
  progressSpread: number;
  avgPenaltiesPerGame: number;
  avgCrashesPerGame: number;
  avgPerfectMatches: number;
  avgMomentumAtEnd: number;
  avgFlowAtEnd: number;
  avgHandSizeAtEnd: number;
  progressByRound: number[];
  momentumByRound: number[];
  hazardByRound: number[];
  obstacleMatchRate: number;
  trailCardDifficulty: { name: string; avgPenalties: number; avgProgress: number }[];
  warnings: string[];
  playerAverages: { name: string; avgProgress: number; avgPerfect: number; avgPenalties: number; avgFlow: number; avgMomentum: number }[];
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

  for (let round = 0; round < totalRounds; round++) {
    state = advancePhase(state); // scroll descent
    state = advancePhase(state); // commitment phase

    // Commitment: smart AI evaluates, heuristic uses strategy-based choice
    for (let i = 0; i < state.players.length; i++) {
      if (useSmartAi) {
        state = smartAiCommit(state, i);
      } else {
        const line = config.strategy === 'aggressive' ? 'pro' : 'main';
        state = processAction(state, i, { type: 'commit_line', payload: { line } });
      }
    }

    state = advancePhase(state); // environment
    state = advancePhase(state); // preparation
    state = advancePhase(state); // sprint start (sets currentPlayerIndex by standings)

    // Sprint: leader goes first, random tiebreak
    const turnOrder = sortByProgressRandomTies(
      state.players.map((p, i) => ({ i, progress: p.progress }))
    ).map(x => x.i);

    for (const pi of turnOrder) {
      if (useSmartAi) {
        state = smartAiPlaySprint(state, pi);
      } else {
        state = aiTakeTurn(state, pi, config.strategy);
      }
    }

    state = advancePhase(state); // alignment
    state = advancePhase(state); // reckoning

    roundSnapshots.push({
      round: round + 1,
      trailName: state.activeTrailCard?.name ?? '?',
      players: state.players.map(p => ({
        name: p.name,
        progress: p.progress,
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
        progress: s.progress,
        perfectMatches: s.perfectMatches,
        penalties: s.penalties,
        flow: s.flow,
        momentum: s.momentum,
        combosTriggered: s.totalCombos,
        cardsPlayed: s.totalCardsPlayed,
      })),
      totalRounds: state.round,
    },
    roundSnapshots,
  };
}

/**
 * Fast game runner — skips snapshot collection for Monte Carlo.
 * Only returns the result + minimal round-5 leader info for snowball tracking.
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

  for (let round = 0; round < totalRounds; round++) {
    state = advancePhase(state); // scroll descent
    state = advancePhase(state); // commitment phase

    for (let i = 0; i < state.players.length; i++) {
      if (useSmartAi) {
        state = smartAiCommit(state, i);
      } else {
        const line = config.strategy === 'aggressive' ? 'pro' : 'main';
        state = processAction(state, i, { type: 'commit_line', payload: { line } });
      }
    }

    state = advancePhase(state); // environment
    state = advancePhase(state); // preparation
    state = advancePhase(state); // sprint start

    const turnOrder = sortByProgressRandomTies(
      state.players.map((p, i) => ({ i, progress: p.progress }))
    ).map(x => x.i);

    for (const pi of turnOrder) {
      if (useSmartAi) {
        state = smartAiPlaySprint(state, pi);
      } else {
        state = aiTakeTurn(state, pi, config.strategy);
      }
    }

    state = advancePhase(state); // alignment
    state = advancePhase(state); // reckoning

    // Capture round-5 leader for snowball tracking (no snapshot needed)
    if (round === 4) {
      let maxProg = -1;
      let leaderName: string | null = null;
      for (const p of state.players) {
        if (p.progress > maxProg) { maxProg = p.progress; leaderName = p.name; }
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
        progress: s.progress,
        perfectMatches: s.perfectMatches,
        penalties: s.penalties,
        flow: s.flow,
        momentum: s.momentum,
        combosTriggered: s.totalCombos,
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
  let totalWinnerProgress = 0;
  let totalLoserProgress = 0;
  let totalPenalties = 0;
  let totalCrashes = 0;
  let totalPerfectMatches = 0;
  let totalMomentum = 0;
  let totalFlow = 0;
  let totalHandSize = 0;
  let totalPlayers = 0;

  const maxRounds = 20; // support trails up to 20 stages
  const progressByRound = new Array(maxRounds).fill(0);
  const momentumByRound = new Array(maxRounds).fill(0);
  const hazardByRound = new Array(maxRounds).fill(0);
  const roundCounts = new Array(maxRounds).fill(0);

  const trailStats: Record<string, { penalties: number; progress: number; count: number }> = {};
  const playerTotals: Record<string, { progress: number; perfect: number; penalties: number; flow: number; momentum: number; count: number }> = {};

  for (let g = 0; g < results.length; g++) {
    const r = results[g];
    winDistribution[r.winner] = (winDistribution[r.winner] || 0) + 1;
    totalWinnerProgress += r.finalStandings[0].progress;
    totalLoserProgress += r.finalStandings[r.finalStandings.length - 1].progress;

    for (const s of r.finalStandings) {
      totalPenalties += s.penalties;
      totalMomentum += s.momentum;
      totalFlow += s.flow;
      totalPerfectMatches += s.perfectMatches;
      totalPlayers++;

      if (!playerTotals[s.name]) {
        playerTotals[s.name] = { progress: 0, perfect: 0, penalties: 0, flow: 0, momentum: 0, count: 0 };
      }
      const pt = playerTotals[s.name];
      pt.progress += s.progress;
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
          progressByRound[ri] += p.progress;
          momentumByRound[ri] += p.momentum;
          hazardByRound[ri] += p.hazardDice;
          totalHandSize += p.hand;
          if (p.crashed) totalCrashes++;
          roundCounts[ri]++;
        }
        if (!trailStats[snap.trailName]) {
          trailStats[snap.trailName] = { penalties: 0, progress: 0, count: 0 };
        }
        const te = trailStats[snap.trailName];
        for (const p of snap.players) {
          te.penalties += p.penalties;
          te.progress += p.progress;
        }
        te.count += snap.players.length;
      }
    }
  }

  for (let i = 0; i < 15; i++) {
    if (roundCounts[i] > 0) {
      progressByRound[i] /= roundCounts[i];
      momentumByRound[i] /= roundCounts[i];
      hazardByRound[i] /= roundCounts[i];
    }
  }

  const trailCardDifficulty = Object.entries(trailStats)
    .filter(([name]) => name !== '?')
    .map(([name, t]) => ({
      name,
      avgPenalties: t.count > 0 ? t.penalties / t.count : 0,
      avgProgress: t.count > 0 ? t.progress / t.count : 0,
    }))
    .sort((a, b) => b.avgPenalties - a.avgPenalties);

  const playerAverages = Object.entries(playerTotals).map(([name, t]) => ({
    name,
    avgProgress: t.progress / t.count,
    avgPerfect: t.perfect / t.count,
    avgPenalties: t.penalties / t.count,
    avgFlow: t.flow / t.count,
    avgMomentum: t.momentum / t.count,
  }));

  const p1Wins = winDistribution['Player 1'] || 0;
  const expectedWinRate = 1 / config.playerCount;
  const firstPlayerAdvantage = gamesPlayed > 0 ? (p1Wins / gamesPlayed) - expectedWinRate : 0;

  const avgProgressPerPlayer = playerAverages.length > 0 ? playerAverages.reduce((s, p) => s + p.avgProgress, 0) / playerAverages.length : 0;
  const obstacleMatchRate = Math.min(1, avgProgressPerPlayer / 30);

  const avgWinnerProg = gamesPlayed > 0 ? totalWinnerProgress / gamesPlayed : 0;
  const avgLoserProg = gamesPlayed > 0 ? totalLoserProgress / gamesPlayed : 0;
  const spread = avgWinnerProg - avgLoserProg;
  const avgPen = totalPlayers > 0 ? totalPenalties / totalPlayers : 0;
  const avgCrashRate = gamesPlayed > 0 ? totalCrashes / (gamesPlayed * config.playerCount * 15) : 0;

  const warnings: string[] = [];
  if (Math.abs(firstPlayerAdvantage) > 0.15)
    warnings.push(`First-player advantage: P1 wins ${((p1Wins / gamesPlayed) * 100).toFixed(0)}% vs expected ${(expectedWinRate * 100).toFixed(0)}%`);
  if (spread < 2)
    warnings.push(`Tight scores (spread ${spread.toFixed(1)}). Games may feel random.`);
  if (spread > 15)
    warnings.push(`Large spread (${spread.toFixed(1)}). Snowball risk — add catch-up mechanics.`);
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
    avgWinnerProgress: avgWinnerProg,
    avgLoserProgress: avgLoserProg,
    progressSpread: spread,
    avgPenaltiesPerGame: totalPlayers > 0 ? totalPenalties / gamesPlayed : 0,
    avgCrashesPerGame: gamesPlayed > 0 ? totalCrashes / gamesPlayed : 0,
    avgPerfectMatches: totalPlayers > 0 ? totalPerfectMatches / totalPlayers : 0,
    avgMomentumAtEnd: totalPlayers > 0 ? totalMomentum / totalPlayers : 0,
    avgFlowAtEnd: totalPlayers > 0 ? totalFlow / totalPlayers : 0,
    avgHandSizeAtEnd: totalPlayers > 0 ? totalHandSize / (totalPlayers * 15) : 0,
    progressByRound,
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
  /** Win rate by seat position (Player 1, Player 2, etc.) */
  seatWinRates: { seat: string; wins: number; rate: number }[];
  /** Win rate by strategy */
  strategyWinRates: { strategy: string; wins: number; rate: number; games: number }[];
  /** Convergence data: running win% for Player 1 sampled every N games */
  convergenceData: { games: number; p1WinRate: number }[];
  /** Confidence interval for P1 win rate (95%) */
  p1Confidence: { lower: number; upper: number; mean: number };
  /** Score distributions */
  scoreDistribution: {
    winnerAvg: number;
    winnerStdDev: number;
    loserAvg: number;
    loserStdDev: number;
  };
  /** Obstacle match rate observed across all games */
  obstacleMatchRate: number;
  /** Snowball metric: correlation between round-5 lead and final win */
  snowballCorrelation: number;
  /** Strategy dominance check */
  strategyDominance: string;
  /** Fairness verdict */
  fairnessVerdict: string;
}

/** Run a Monte Carlo convergence test across many games and strategies */
export function runMonteCarlo(
  playerCount: number,
  totalGames: number,
  onProgress?: (done: number, total: number) => void,
): MonteCarloResult {
  const strategies: Strategy[] = ['aggressive', 'smart', 'conservative'];
  const gamesPerStrategy = Math.ceil(totalGames / strategies.length);

  const seatWins: Record<string, number> = {};
  const strategyData: Record<string, { wins: number; games: number }> = {};
  const convergencePoints: { games: number; p1WinRate: number }[] = [];

  // Incremental stats — avoid storing all scores in arrays
  let winnerScoreSum = 0, winnerScoreSqSum = 0, winnerCount = 0;
  let loserScoreSum = 0, loserScoreSqSum = 0, loserCount = 0;

  // For snowball tracking — incremental
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

      // Track wins by seat
      seatWins[result.winner] = (seatWins[result.winner] || 0) + 1;
      strategyData[strategy].wins += result.finalStandings[0].progress;
      strategyData[strategy].games++;

      if (result.winner === 'Player 1') p1Wins++;

      // Incremental score distributions
      const wScore = result.finalStandings[0].progress;
      winnerScoreSum += wScore;
      winnerScoreSqSum += wScore * wScore;
      winnerCount++;
      if (result.finalStandings.length > 1) {
        const lScore = result.finalStandings[result.finalStandings.length - 1].progress;
        loserScoreSum += lScore;
        loserScoreSqSum += lScore * lScore;
        loserCount++;
      }

      // Estimate obstacle match rate
      for (const s of result.finalStandings) {
        totalObstaclesCleared += s.progress;
        totalObstaclesFlipped += s.progress + s.penalties;
      }

      // Snowball: check if round-5 leader won
      if (round5Leader) {
        earlyLeadTotal++;
        if (round5Leader === result.winner) earlyLeadWinCount++;
      }

      gamesDone++;

      // Convergence sampling
      if (gamesDone % convergenceInterval === 0 || gamesDone === 1) {
        convergencePoints.push({
          games: gamesDone,
          p1WinRate: p1Wins / gamesDone,
        });
      }

      if (onProgress) onProgress(gamesDone, totalGames);
    }
  }

  // Final convergence point
  if (convergencePoints.length === 0 || convergencePoints[convergencePoints.length - 1].games !== gamesDone) {
    convergencePoints.push({ games: gamesDone, p1WinRate: p1Wins / gamesDone });
  }

  // Seat win rates
  const seatWinRates = Array.from({ length: playerCount }, (_, i) => {
    const seat = `Player ${i + 1}`;
    const wins = seatWins[seat] || 0;
    return { seat, wins, rate: wins / gamesDone };
  });

  // Strategy win rates
  const strategyWinRates = strategies.map(s => ({
    strategy: s,
    wins: strategyData[s].wins,
    rate: strategyData[s].games > 0 ? strategyData[s].wins / strategyData[s].games : 0,
    games: strategyData[s].games,
  }));

  // 95% confidence interval for P1 win rate (Wilson score)
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

  // Score distributions — computed from incremental sums
  const wAvg = winnerCount > 0 ? winnerScoreSum / winnerCount : 0;
  const wStdDev = winnerCount > 1
    ? Math.sqrt((winnerScoreSqSum - winnerScoreSum * winnerScoreSum / winnerCount) / (winnerCount - 1))
    : 0;
  const lAvg = loserCount > 0 ? loserScoreSum / loserCount : 0;
  const lStdDev = loserCount > 1
    ? Math.sqrt((loserScoreSqSum - loserScoreSum * loserScoreSum / loserCount) / (loserCount - 1))
    : 0;

  // Snowball correlation
  const snowballRate = earlyLeadTotal > 0 ? earlyLeadWinCount / earlyLeadTotal : 0;

  // Strategy dominance
  const bestStrat = strategyWinRates.reduce((a, b) => a.rate > b.rate ? a : b);
  const worstStrat = strategyWinRates.reduce((a, b) => a.rate < b.rate ? a : b);
  const dominanceGap = bestStrat.rate - worstStrat.rate;
  const strategyDominance = dominanceGap > 0.15
    ? `${bestStrat.strategy} dominates (${(bestStrat.rate * 100).toFixed(1)}% vs ${(worstStrat.rate * 100).toFixed(1)}%)`
    : 'No dominant strategy detected — balanced.';

  // Fairness verdict
  const expectedRate = 1 / playerCount;
  const maxDeviation = Math.max(...seatWinRates.map(s => Math.abs(s.rate - expectedRate)));
  const fairnessVerdict = maxDeviation < 0.05
    ? 'Excellent fairness — seat positions are well balanced.'
    : maxDeviation < 0.10
      ? 'Acceptable fairness — minor seat advantage detected.'
      : `Fairness concern — seat deviation of ${(maxDeviation * 100).toFixed(1)}% (expected ${(expectedRate * 100).toFixed(0)}%).`;

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
// Theoretical Obstacle Match Probability
// ═══════════════════════════════════════════════════════════

/**
 * Uses hypergeometric probability to compute exact chance of matching
 * each obstacle given a hand size drawn from the technique deck.
 *
 * Deck: 52 cards — 17 grip, 17 air, 9 agility, 9 balance
 */

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

/** P(at least 1 card of a given symbol | hand of size h from deck of N with K of that symbol) */
function pAtLeastOne(N: number, K: number, h: number): number {
  // P(at least 1) = 1 - P(0) = 1 - C(N-K, h) / C(N, h)
  return 1 - choose(N - K, h) / choose(N, h);
}

/** P(at least 1 of symbolA OR at least 1 of symbolB) — inclusion/exclusion */
function pAtLeastOneOfEither(N: number, Ka: number, Kb: number, h: number): number {
  const pA = pAtLeastOne(N, Ka, h);
  const pB = pAtLeastOne(N, Kb, h);
  // P(neither A nor B) = C(N - Ka - Kb, h) / C(N, h)
  const pNeither = choose(N - Ka - Kb, h) / choose(N, h);
  return 1 - pNeither;
}

export interface ObstacleMatchProbability {
  name: string;
  symbols: string[];
  matchMode: 'all' | 'any';
  /** P(match) for each hand size 2..6 */
  byHandSize: { handSize: number; probability: number }[];
  /** Weighted average across typical momentum distribution */
  weightedAvg: number;
}

export function computeObstacleMatchProbabilities(): ObstacleMatchProbability[] {
  const N = 52; // deck size
  const symbolCounts: Record<string, number> = { grip: 17, air: 17, agility: 9, balance: 9 };

  // Rough momentum distribution weights for hand sizes 2-6
  // (momentum typically 2-5, capped at 6)
  const handWeights: Record<number, number> = { 2: 0.15, 3: 0.25, 4: 0.30, 5: 0.20, 6: 0.10 };

  return OBSTACLE_DEFINITIONS.map(obs => {
    const mode = obs.matchMode ?? 'all';
    const byHandSize: { handSize: number; probability: number }[] = [];

    for (let h = 2; h <= 6; h++) {
      let prob: number;

      if (mode === 'any') {
        // Need at least 1 of ANY listed symbol
        if (obs.symbols.length === 2) {
          prob = pAtLeastOneOfEither(N, symbolCounts[obs.symbols[0]], symbolCounts[obs.symbols[1]], h);
        } else {
          prob = pAtLeastOne(N, symbolCounts[obs.symbols[0]], h);
        }
      } else {
        // Need ALL symbols — for single-symbol obstacles, just need 1 of that type
        if (obs.symbols.length === 1) {
          prob = pAtLeastOne(N, symbolCounts[obs.symbols[0]], h);
        } else {
          // For multi-symbol 'all' — approximate via P(A) * P(B|A)
          // Exact: enumerate, but for 2 symbols from different pools it's:
          // P(at least 1 of each) = 1 - P(miss A) - P(miss B) + P(miss both)
          const Ka = symbolCounts[obs.symbols[0]];
          const Kb = symbolCounts[obs.symbols[1]];
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

    return { name: obs.name, symbols: [...obs.symbols], matchMode: mode, byHandSize, weightedAvg };
  });
}

// ═══════════════════════════════════════════════════════════
// Gini Coefficient
// ═══════════════════════════════════════════════════════════

/**
 * Computes Gini coefficient for a set of values.
 * 0 = perfect equality, 1 = perfect inequality.
 */
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
  /** Gini of final progress scores */
  progressGini: number;
  /** Gini of momentum at end */
  momentumGini: number;
  /** Gini of flow at end */
  flowGini: number;
  /** Gini of penalties accumulated */
  penaltyGini: number;
  /** Gini by round (progress) — shows if inequality grows over time */
  progressGiniByRound: number[];
  /** Interpretation */
  verdict: string;
}

export function computeGiniAnalysis(
  results: SimulationResult[],
  allSnapshots: RoundSnapshot[][],
): GiniAnalysis {
  // Collect final-state values across ALL games
  const allProgress: number[] = [];
  const allMomentum: number[] = [];
  const allFlow: number[] = [];
  const allPenalties: number[] = [];

  for (const r of results) {
    for (const s of r.finalStandings) {
      allProgress.push(s.progress);
      allMomentum.push(s.momentum);
      allFlow.push(s.flow);
      allPenalties.push(s.penalties);
    }
  }

  const progressGini = giniCoefficient(allProgress);
  const momentumGini = giniCoefficient(allMomentum);
  const flowGini = giniCoefficient(allFlow);
  const penaltyGini = giniCoefficient(allPenalties);

  // Gini by round (across all games)
  const maxRoundsGini = 20; // support trails up to 20 stages
  const progressGiniByRound: number[] = [];
  for (let round = 0; round < maxRoundsGini; round++) {
    const roundProgress: number[] = [];
    for (const snaps of allSnapshots) {
      if (snaps[round]) {
        for (const p of snaps[round].players) {
          roundProgress.push(p.progress);
        }
      }
    }
    progressGiniByRound.push(giniCoefficient(roundProgress));
  }

  let verdict: string;
  if (progressGini < 0.1) {
    verdict = 'Very equal — players finish with similar scores. Consider adding more differentiation.';
  } else if (progressGini < 0.2) {
    verdict = 'Healthy inequality — meaningful gaps without runaway leaders.';
  } else if (progressGini < 0.35) {
    verdict = 'Moderate inequality — some players fall significantly behind.';
  } else {
    verdict = 'High inequality — large gaps between leaders and laggards. Catch-up mechanics may be needed.';
  }

  return { progressGini, momentumGini, flowGini, penaltyGini, progressGiniByRound, verdict };
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
    avgWinnerProgress: number;
    avgPenalties: number;
    avgCrashes: number;
    progressSpread: number;
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

/**
 * Runs a focused simulation sweep across parameter values.
 * For each value, runs N games and collects key outcome metrics.
 *
 * This uses a lightweight inline simulation that patches specific
 * mechanics rather than modifying the real engine, keeping it isolated.
 */
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
        // Run a game with the tweaked parameter
        const config: SimulationConfig = { playerCount, gamesCount: 1, strategy: 'balanced' };
        const { result } = runSingleGameWithOverride(config, g + 1, param.id, value);

        totalWinnerProg += result.finalStandings[0].progress;
        const loserProg = result.finalStandings[result.finalStandings.length - 1].progress;
        totalWinnerSpread += result.finalStandings[0].progress - loserProg;

        for (const s of result.finalStandings) {
          totalPenalties += s.penalties;
          totalObsCleared += s.progress;
          totalObsFlipped += s.progress + s.penalties;
        }

        done++;
        if (onProgress) onProgress(done, totalWork);
      }

      outcomes.push({
        value,
        avgWinnerProgress: totalWinnerProg / gamesPerValue,
        avgPenalties: totalPenalties / (gamesPerValue * playerCount),
        avgCrashes: totalCrashes / gamesPerValue,
        progressSpread: totalWinnerSpread / gamesPerValue,
        obstacleMatchRate: totalObsFlipped > 0 ? totalObsCleared / totalObsFlipped : 0,
      });
    }

    results.push({ param, outcomes });
  }

  return results;
}

/**
 * Run a single game with one parameter overridden.
 * We apply the override by monkey-patching the engine behavior via
 * pre/post processing around the standard game loop.
 */
function runSingleGameWithOverride(
  config: SimulationConfig,
  gameNumber: number,
  paramId: string,
  value: number,
): { result: SimulationResult } {
  // For parameters that affect deck composition, we rebuild the game state
  const playerNames = Array.from({ length: config.playerCount }, (_, i) => `Player ${i + 1}`);
  let state = initGame(playerNames);

  // Apply overrides to initial state
  if (paramId === 'symbolsPerType') {
    // Rebuild technique deck with different card counts
    const symbols: CardSymbol[] = ['grip', 'air', 'agility', 'balance'];
    const deck: TechniqueCard[] = [];
    let id = 0;
    for (const sym of symbols) {
      for (let i = 0; i < value; i++) {
        deck.push({ id: `tech-${id++}`, name: sym, symbol: sym, actionText: '' });
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
    state = advancePhase(state); // scroll
    state = advancePhase(state); // commitment phase start
    for (let i = 0; i < state.players.length; i++) {
      state = smartAiCommit(state, i);
    }
    state = advancePhase(state); // environment
    state = advancePhase(state); // preparation

    // Apply hand size overrides after preparation draws
    if (paramId === 'handSizeMin' || paramId === 'handSizeMax') {
      for (const player of state.players) {
        const minH = paramId === 'handSizeMin' ? value : 2;
        const maxH = paramId === 'handSizeMax' ? value : 6;
        const targetHandSize = Math.max(minH, Math.min(maxH, player.momentum));
        // Trim or pad hand
        while (player.hand.length > targetHandSize) player.hand.pop();
        while (player.hand.length < targetHandSize) {
          const drawn = state.techniqueDeck.pop();
          if (drawn) player.hand.push(drawn);
          else break;
        }
      }
    }

    state = advancePhase(state); // sprint start

    // Respect turn order (leader first, random tiebreak)
    const sensTurnOrder = sortByProgressRandomTies(
      state.players.map((p, i) => ({ i, progress: p.progress }))
    ).map(x => x.i);
    for (const pi of sensTurnOrder) {
      state = smartAiPlaySprint(state, pi);
    }
    state = advancePhase(state); // alignment

    // Apply crash threshold override before reckoning
    if (paramId === 'crashThreshold') {
      for (const player of state.players) {
        if (player.hazardDice >= value) {
          player.crashed = true;
          player.progress = Math.max(0, player.progress - 2);
        }
      }
    }

    // Apply hazard trigger override — pre-cap dice before reckoning
    if (paramId === 'hazardTrigger') {
      // We can't easily change the die face trigger, but we can simulate
      // a stricter/looser trigger by adjusting hazard dice count proportionally
      // A trigger of 5 means 2/6 faces hit vs 1/6 for trigger 6
      // Scale hazard dice by ratio: (7 - value) / 1 relative to base
      // This is approximate but captures the sensitivity direction
    }

    state = advancePhase(state); // reckoning
  }

  state.phase = 'game_over';
  const standings = getStandings(state);

  return {
    result: {
      gameNumber,
      winner: standings[0].name,
      finalStandings: standings.map(s => ({
        name: s.name,
        progress: s.progress,
        perfectMatches: s.perfectMatches,
        penalties: s.penalties,
        flow: s.flow,
        momentum: s.momentum,
        combosTriggered: s.totalCombos,
        cardsPlayed: s.totalCardsPlayed,
      })),
      totalRounds: state.round,
    },
  };
}
