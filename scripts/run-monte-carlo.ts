#!/usr/bin/env npx tsx
/**
 * Parallel Monte Carlo simulation runner.
 * Spawns child processes to run games across all CPU cores.
 *
 * Usage: npx tsx scripts/run-monte-carlo.ts [totalGames] [playerCount]
 *        npx tsx scripts/run-monte-carlo.ts 3000 4
 */
import { execFile } from 'child_process';
import { cpus } from 'os';
import { resolve } from 'path';

const totalGames = parseInt(process.argv[2] || '1500', 10);
const playerCount = parseInt(process.argv[3] || '4', 10);
const numCpus = cpus().length;
const numWorkers = Math.min(numCpus, 12);

type Strategy = 'aggressive' | 'smart' | 'conservative';
const strategies: Strategy[] = ['aggressive', 'smart', 'conservative'];
const gamesPerStrategy = Math.ceil(totalGames / strategies.length);

console.log(`\n=== Parallel Monte Carlo ===`);
console.log(`Games: ${totalGames} (${gamesPerStrategy} per strategy)`);
console.log(`Players: ${playerCount}`);
console.log(`Workers: ${numWorkers} (${numCpus} CPUs detected)`);
console.log(`Strategies: ${strategies.join(', ')}\n`);

interface WorkerTask {
  strategy: Strategy;
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

// Build task list: split each strategy's games across workers
const tasks: WorkerTask[] = [];
let globalIndex = 0;

for (const strategy of strategies) {
  const gamesPerWorker = Math.ceil(gamesPerStrategy / numWorkers);
  let remaining = gamesPerStrategy;

  for (let w = 0; w < numWorkers && remaining > 0; w++) {
    const batch = Math.min(gamesPerWorker, remaining);
    tasks.push({
      strategy,
      playerCount,
      gamesCount: batch,
      startIndex: globalIndex,
    });
    globalIndex += batch;
    remaining -= batch;
  }
}

const workerPath = resolve(__dirname, 'sim-worker.ts');
const startTime = Date.now();

function runWorker(task: WorkerTask): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const taskJson = JSON.stringify(task);
    execFile('npx', ['tsx', workerPath, taskJson], {
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Worker failed: ${stderr || error.message}`));
        return;
      }
      try {
        // Extract last line of stdout (the JSON result)
        const lines = stdout.trim().split('\n');
        const resultJson = lines[lines.length - 1];
        resolve(JSON.parse(resultJson));
      } catch (e) {
        reject(new Error(`Failed to parse worker output: ${stdout}`));
      }
    });
  });
}

async function main() {
  // Run workers in batches of numWorkers
  const allResults: WorkerResult[] = [];
  let completed = 0;

  for (let i = 0; i < tasks.length; i += numWorkers) {
    const batch = tasks.slice(i, i + numWorkers);
    const batchResults = await Promise.all(batch.map(t => runWorker(t)));
    allResults.push(...batchResults);
    completed += batch.length;

    const elapsed = (Date.now() - startTime) / 1000;
    const gamesCompleted = allResults.reduce((s, r) => s + r.gamesDone, 0);
    process.stdout.write(`\r  Progress: ${gamesCompleted}/${totalGames} games (${(gamesCompleted / elapsed).toFixed(1)} games/s)  `);
  }

  const elapsed = (Date.now() - startTime) / 1000;

  // Merge results
  const seatWins: Record<string, number> = {};
  const strategyData: Record<string, { wins: number; games: number }> = {};
  let p1Wins = 0;
  let winnerScoreSum = 0, winnerScoreSqSum = 0, winnerCount = 0;
  let loserScoreSum = 0, loserScoreSqSum = 0, loserCount = 0;
  let earlyLeadWinCount = 0, earlyLeadTotal = 0;
  let totalObstaclesCleared = 0, totalObstaclesFlipped = 0;
  let gamesDone = 0;

  for (let i = 0; i < allResults.length; i++) {
    const r = allResults[i];
    for (const [seat, wins] of Object.entries(r.seatWins)) {
      seatWins[seat] = (seatWins[seat] || 0) + wins;
    }
    p1Wins += r.p1Wins;
    winnerScoreSum += r.winnerScoreSum;
    winnerScoreSqSum += r.winnerScoreSqSum;
    winnerCount += r.winnerCount;
    loserScoreSum += r.loserScoreSum;
    loserScoreSqSum += r.loserScoreSqSum;
    loserCount += r.loserCount;
    earlyLeadWinCount += r.earlyLeadWinCount;
    earlyLeadTotal += r.earlyLeadTotal;
    totalObstaclesCleared += r.totalObstaclesCleared;
    totalObstaclesFlipped += r.totalObstaclesFlipped;
    gamesDone += r.gamesDone;

    const strategy = tasks[i].strategy;
    if (!strategyData[strategy]) strategyData[strategy] = { wins: 0, games: 0 };
    strategyData[strategy].wins += r.strategyWins;
    strategyData[strategy].games += r.strategyGames;
  }

  console.log(`\n\nCompleted ${gamesDone} games in ${elapsed.toFixed(1)}s (${(gamesDone / elapsed).toFixed(1)} games/s)\n`);

  // Compute final stats
  const seatWinRates = Array.from({ length: playerCount }, (_, i) => {
    const seat = `Player ${i + 1}`;
    const wins = seatWins[seat] || 0;
    return { seat, wins, rate: wins / gamesDone };
  });

  const wAvg = winnerCount > 0 ? winnerScoreSum / winnerCount : 0;
  const wStdDev = winnerCount > 1
    ? Math.sqrt((winnerScoreSqSum - winnerScoreSum * winnerScoreSum / winnerCount) / (winnerCount - 1))
    : 0;
  const lAvg = loserCount > 0 ? loserScoreSum / loserCount : 0;
  const lStdDev = loserCount > 1
    ? Math.sqrt((loserScoreSqSum - loserScoreSum * loserScoreSum / loserCount) / (loserCount - 1))
    : 0;

  const snowballRate = earlyLeadTotal > 0 ? earlyLeadWinCount / earlyLeadTotal : 0;
  const obstacleMatchRate = totalObstaclesFlipped > 0 ? totalObstaclesCleared / totalObstaclesFlipped : 0;

  // P1 confidence interval (Wilson score)
  const p1Rate = p1Wins / gamesDone;
  const z = 1.96;
  const denom = 1 + z * z / gamesDone;
  const centre = p1Rate + z * z / (2 * gamesDone);
  const spread = z * Math.sqrt((p1Rate * (1 - p1Rate) + z * z / (4 * gamesDone)) / gamesDone);
  const p1Lower = Math.max(0, (centre - spread) / denom);
  const p1Upper = Math.min(1, (centre + spread) / denom);

  // Fairness
  const expectedRate = 1 / playerCount;
  const maxDeviation = Math.max(...seatWinRates.map(s => Math.abs(s.rate - expectedRate)));

  // Print results
  console.log('--- Seat Win Rates ---');
  for (const s of seatWinRates) {
    const bar = '█'.repeat(Math.round(s.rate * 100));
    console.log(`  ${s.seat}: ${s.wins} wins (${(s.rate * 100).toFixed(1)}%) ${bar}`);
  }

  console.log('\n--- Strategy Performance (avg winner progress) ---');
  for (const [strat, data] of Object.entries(strategyData)) {
    console.log(`  ${strat}: ${(data.wins / data.games).toFixed(1)} avg progress (${data.games} games)`);
  }

  console.log('\n--- Key Metrics ---');
  console.log(`  P1 Win Rate: ${(p1Rate * 100).toFixed(1)}% [95% CI: ${(p1Lower * 100).toFixed(1)}%-${(p1Upper * 100).toFixed(1)}%]`);
  console.log(`  Winner avg score: ${wAvg.toFixed(1)} (σ ${wStdDev.toFixed(1)})`);
  console.log(`  Loser avg score: ${lAvg.toFixed(1)} (σ ${lStdDev.toFixed(1)})`);
  console.log(`  Spread: ${(wAvg - lAvg).toFixed(1)}`);
  console.log(`  Snowball: ${(snowballRate * 100).toFixed(1)}% (round-5 leader wins)`);
  console.log(`  Obstacle match rate: ${(obstacleMatchRate * 100).toFixed(1)}%`);
  console.log(`  Fairness: ${maxDeviation < 0.05 ? 'Excellent' : maxDeviation < 0.10 ? 'Acceptable' : `Concern (${(maxDeviation * 100).toFixed(1)}% deviation)`}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
