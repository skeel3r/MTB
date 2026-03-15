import { GameState, SimulationConfig, SimulationResult } from './types';
import { initGame, advancePhase, processAction, getStandings } from './engine';

type Strategy = SimulationConfig['strategy'];

function canMatchObstacle(
  hand: { symbol: string }[],
  symbols: string[],
  matchMode: 'all' | 'any',
): boolean {
  const usedIndices = new Set<number>();
  if (matchMode === 'any') {
    return symbols.some(sym =>
      hand.some((c, i) => c.symbol === sym && !usedIndices.has(i) && (usedIndices.add(i), true)),
    );
  }
  return symbols.every(sym => {
    const idx = hand.findIndex((c, i) => c.symbol === sym && !usedIndices.has(i));
    if (idx >= 0) { usedIndices.add(idx); return true; }
    return false;
  });
}

function resolveActiveObstacles(state: GameState, playerIndex: number): GameState {
  let s = state;
  while (s.activeObstacles.length > 0 && !s.players[playerIndex].crashed && !s.players[playerIndex].turnEnded) {
    const obs = s.activeObstacles[0];
    const player = s.players[playerIndex];
    const mode = obs.matchMode ?? 'all';
    const hasMatch = canMatchObstacle(player.hand, obs.symbols, mode);
    s = processAction(s, playerIndex, {
      type: 'resolve_obstacle',
      payload: { obstacleIndex: 0, choice: hasMatch ? 'match' : 'take_penalty' },
    });
  }
  return s;
}

function aiTakeTurn(state: GameState, playerIndex: number, strategy: Strategy): GameState {
  let s = { ...state };
  const p = () => s.players[playerIndex];

  // Flip and resolve 1-2 obstacles (free actions)
  if (!p().crashed && !p().turnEnded) {
    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
    s = resolveActiveObstacles(s, playerIndex);
  }
  if (strategy === 'aggressive' && !p().crashed && !p().turnEnded) {
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
        s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: 0 } });
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
  const strategies: Strategy[] = ['aggressive', 'balanced', 'conservative'];
  const gamesPerStrategy = Math.ceil(totalGames / strategies.length);

  const seatWins: Record<string, number> = {};
  const strategyData: Record<string, { wins: number; games: number }> = {};
  const convergencePoints: { games: number; p1WinRate: number }[] = [];
  const winnerScores: number[] = [];
  const loserScores: number[] = [];

  // For snowball tracking
  const earlyLeadWins: { hadLead: boolean; won: boolean }[] = [];

  let totalObstaclesCleared = 0;
  let totalObstaclesFlipped = 0;
  let gamesDone = 0;
  let p1Wins = 0;

  for (const strategy of strategies) {
    if (!strategyData[strategy]) {
      strategyData[strategy] = { wins: 0, games: 0 };
    }

    for (let g = 0; g < gamesPerStrategy; g++) {
      const config: SimulationConfig = { playerCount, gamesCount: 1, strategy };
      const { result, roundSnapshots } = runSingleGame(config, gamesDone + 1);

      // Track wins by seat
      seatWins[result.winner] = (seatWins[result.winner] || 0) + 1;
      strategyData[strategy].wins += (result.winner === 'Player 1') ? 1 : 0;
      strategyData[strategy].games++;

      if (result.winner === 'Player 1') p1Wins++;

      // Score distributions
      winnerScores.push(result.finalStandings[0].progress);
      if (result.finalStandings.length > 1) {
        loserScores.push(result.finalStandings[result.finalStandings.length - 1].progress);
      }

      // Estimate obstacle match rate from progress vs penalties
      for (const s of result.finalStandings) {
        totalObstaclesCleared += s.progress; // rough proxy
        totalObstaclesFlipped += s.progress + s.penalties; // cleared + blown by
      }

      // Snowball: check if leader at round 5 also won
      if (roundSnapshots.length >= 5) {
        const r5 = roundSnapshots[4];
        const maxProg = Math.max(...r5.players.map(p => p.progress));
        const leader = r5.players.find(p => p.progress === maxProg);
        if (leader) {
          earlyLeadWins.push({
            hadLead: leader.name === result.winner,
            won: true,
          });
        }
      }

      gamesDone++;

      // Convergence sampling
      if (gamesDone % Math.max(1, Math.floor(totalGames / 50)) === 0 || gamesDone === 1) {
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

  // Score distributions
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const stdDev = (arr: number[], mean: number) =>
    arr.length > 1 ? Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1)) : 0;
  const wAvg = avg(winnerScores);
  const lAvg = avg(loserScores);

  // Snowball correlation
  const snowballRate = earlyLeadWins.length > 0
    ? earlyLeadWins.filter(e => e.hadLead).length / earlyLeadWins.length
    : 0;

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
      winnerStdDev: stdDev(winnerScores, wAvg),
      loserAvg: lAvg,
      loserStdDev: stdDev(loserScores, lAvg),
    },
    obstacleMatchRate: totalObstaclesFlipped > 0 ? totalObstaclesCleared / totalObstaclesFlipped : 0,
    snowballCorrelation: snowballRate,
    strategyDominance,
    fairnessVerdict,
  };
}
