import { GameState, SimulationConfig, SimulationResult } from './types';
import { initGame, advancePhase, processAction, getStandings } from './engine';

type Strategy = SimulationConfig['strategy'];

function aiTakeTurn(state: GameState, playerIndex: number, strategy: Strategy): GameState {
  let s = { ...state };

  // Commit to line
  if (strategy === 'aggressive') {
    s = processAction(s, playerIndex, { type: 'commit_line', payload: { line: 'pro' } });
  } else {
    s = processAction(s, playerIndex, { type: 'commit_line', payload: { line: 'main' } });
  }

  // Sprint phase actions
  let actions = 5;
  const p = s.players[playerIndex];

  while (actions > 0 && !p.crashed && !p.turnEnded) {
    if (strategy === 'aggressive') {
      if (actions > 2 && p.momentum < 5) {
        s = processAction(s, playerIndex, { type: 'pedal' });
        actions--;
      } else if (s.activeObstacles.length > 0) {
        s = processAction(s, playerIndex, { type: 'tackle', payload: { obstacleIndex: 0 } });
      } else {
        s = processAction(s, playerIndex, { type: 'pedal' });
        actions--;
      }
    } else if (strategy === 'conservative') {
      if (p.momentum > 3 && actions > 0) {
        s = processAction(s, playerIndex, { type: 'brake' });
        actions--;
      } else if (s.activeObstacles.length > 0) {
        const obstacle = s.activeObstacles[0];
        const usedIndices = new Set<number>();
        const hasMatch = obstacle.symbols.every(sym => {
          const idx = p.hand.findIndex((c, i) => c.symbol === sym && !usedIndices.has(i));
          if (idx >= 0) { usedIndices.add(idx); return true; }
          return false;
        });
        if (hasMatch) {
          s = processAction(s, playerIndex, { type: 'tackle', payload: { obstacleIndex: 0 } });
        } else {
          for (let r = 0; r < 6; r++) {
            const col = getTokenCol(p.grid, r);
            if (col >= 0 && col !== 2 && actions > 0) {
              const dir = col > 2 ? -1 : 1;
              s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
              actions--;
              break;
            }
          }
          if (actions > 0) {
            s = processAction(s, playerIndex, { type: 'pedal' });
            actions--;
          }
        }
      } else if (actions > 0) {
        s = processAction(s, playerIndex, { type: 'pedal' });
        actions--;
      }
    } else {
      if (s.activeObstacles.length > 0) {
        s = processAction(s, playerIndex, { type: 'tackle', payload: { obstacleIndex: 0 } });
      } else if (actions > 0) {
        if (p.momentum < 4) {
          s = processAction(s, playerIndex, { type: 'pedal' });
        } else {
          for (let r = 0; r < 6; r++) {
            const col = getTokenCol(p.grid, r);
            if (col >= 0 && col !== 2) {
              const dir = col > 2 ? -1 : 1;
              s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
              break;
            }
          }
        }
        actions--;
      }
    }

    if (s.activeObstacles.length === 0 && actions <= 1) {
      break;
    }
  }

  s = processAction(s, playerIndex, { type: 'end_turn' });
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

  for (let round = 0; round < 15; round++) {
    state = advancePhase(state);
    state = advancePhase(state);
    for (let i = 0; i < state.players.length; i++) {
      const line = config.strategy === 'aggressive' ? 'pro' : 'main';
      state = processAction(state, i, { type: 'commit_line', payload: { line } });
    }
    state = advancePhase(state);
    state = advancePhase(state);
    state = advancePhase(state);
    for (let i = 0; i < state.players.length; i++) {
      state = aiTakeTurn(state, i, config.strategy);
    }
    state = advancePhase(state);
    state = advancePhase(state);

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
      })),
      totalRounds: state.round,
    },
    roundSnapshots,
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

  const progressByRound = new Array(15).fill(0);
  const momentumByRound = new Array(15).fill(0);
  const hazardByRound = new Array(15).fill(0);
  const roundCounts = new Array(15).fill(0);

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
