#!/usr/bin/env npx tsx
/**
 * Quick benchmark: runs agency analysis to test strategy balance.
 * Usage: npx tsx scripts/run-benchmark.ts [gamesPerMatchup]
 */
import { runAgencyAnalysis } from '../src/lib/simulation';

const gamesPerMatchup = parseInt(process.argv[2] || '50', 10);

console.log(`\n=== Agency Benchmark (${gamesPerMatchup} games/matchup) ===\n`);

const result = runAgencyAnalysis(gamesPerMatchup, (done, total) => {
  if (done % 50 === 0 || done === total) {
    process.stdout.write(`\r  Progress: ${done}/${total} games`);
  }
});

console.log('\n');

console.log('--- Strategy Win Rates ---');
for (const s of result.strategyWinRates) {
  const bar = '█'.repeat(Math.round(s.winRate * 50));
  console.log(`  ${s.strategy.padEnd(14)} ${(s.winRate * 100).toFixed(1)}% (${s.wins}/${s.games}) ${bar}`);
}

console.log('\n--- Strategy Avg Progress ---');
for (const s of result.strategyAvgProgress) {
  console.log(`  ${s.strategy.padEnd(14)} ${s.avgProgress.toFixed(1)}`);
}

console.log('\n--- Head-to-Head (Smart vs Others) ---');
for (const h of result.headToHead) {
  console.log(`  vs ${h.opponent.padEnd(14)} Smart: ${(h.smartWinRate * 100).toFixed(1)}% | Opp: ${(h.opponentWinRate * 100).toFixed(1)}% (${h.games} games)`);
}

console.log(`\n--- Key Metrics ---`);
console.log(`  Skill Gap: ${result.skillGap.toFixed(3)}`);
console.log(`  Decision Quality Corr: ${result.decisionQualityCorrelation.toFixed(3)}`);
console.log(`  Perfect Match Corr: ${result.perfectMatchCorrelation.toFixed(3)}`);
console.log(`  Verdict: ${result.verdict}`);
console.log('');
