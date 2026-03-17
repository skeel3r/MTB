/**
 * Worker process for parallel Monte Carlo simulation.
 * Reads task from stdin, writes results to stdout.
 */
import { SimulationConfig } from '../src/lib/types';
import { runSingleGameFast } from '../src/lib/simulation';

interface WorkerTask {
  strategy: SimulationConfig['strategy'];
  playerCount: number;
  gamesCount: number;
  startIndex: number;
}

interface WorkerResult {
  seatWins: Record<string, number>;
  strategyWins: number;
  strategyGames: number;
  p1Wins: number;
  winnerScoreSum: number;
  winnerScoreSqSum: number;
  winnerCount: number;
  loserScoreSum: number;
  loserScoreSqSum: number;
  loserCount: number;
  earlyLeadWinCount: number;
  earlyLeadTotal: number;
  totalObstaclesCleared: number;
  totalObstaclesFlipped: number;
  gamesDone: number;
}

// Read task from command line args
const task: WorkerTask = JSON.parse(process.argv[2]);

const result: WorkerResult = {
  seatWins: {},
  strategyWins: 0,
  strategyGames: 0,
  p1Wins: 0,
  winnerScoreSum: 0,
  winnerScoreSqSum: 0,
  winnerCount: 0,
  loserScoreSum: 0,
  loserScoreSqSum: 0,
  loserCount: 0,
  earlyLeadWinCount: 0,
  earlyLeadTotal: 0,
  totalObstaclesCleared: 0,
  totalObstaclesFlipped: 0,
  gamesDone: 0,
};

const config: SimulationConfig = {
  playerCount: task.playerCount,
  gamesCount: 1,
  strategy: task.strategy,
};

for (let g = 0; g < task.gamesCount; g++) {
  const { result: gameResult, round5Leader } = runSingleGameFast(config, task.startIndex + g);

  result.seatWins[gameResult.winner] = (result.seatWins[gameResult.winner] || 0) + 1;
  result.strategyWins += gameResult.finalStandings[0].progress;
  result.strategyGames++;

  if (gameResult.winner === 'Player 1') result.p1Wins++;

  const wScore = gameResult.finalStandings[0].progress;
  result.winnerScoreSum += wScore;
  result.winnerScoreSqSum += wScore * wScore;
  result.winnerCount++;

  if (gameResult.finalStandings.length > 1) {
    const lScore = gameResult.finalStandings[gameResult.finalStandings.length - 1].progress;
    result.loserScoreSum += lScore;
    result.loserScoreSqSum += lScore * lScore;
    result.loserCount++;
  }

  for (const s of gameResult.finalStandings) {
    result.totalObstaclesCleared += s.progress;
    result.totalObstaclesFlipped += s.progress + s.penalties;
  }

  if (round5Leader) {
    result.earlyLeadTotal++;
    if (round5Leader === gameResult.winner) result.earlyLeadWinCount++;
  }

  result.gamesDone++;
}

// Output result as JSON to stdout
console.log(JSON.stringify(result));
