'use client';

import { useState } from 'react';
import { SimulationConfig, SimulationResult } from '@/lib/types';
import { runSimulation } from '@/lib/simulation';

export default function SimulatePage() {
  const [config, setConfig] = useState<SimulationConfig>({
    playerCount: 4,
    gamesCount: 10,
    strategy: 'balanced',
  });
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    // Use setTimeout to let UI update
    setTimeout(() => {
      const r = runSimulation(config);
      setResults(r);
      setRunning(false);
    }, 50);
  };

  // Aggregate stats
  const stats = results ? computeStats(results) : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Simulation Mode</h1>
        <p className="text-gray-400 mb-6">Run automated games to test balance and mechanics.</p>

        {/* Config */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Players</label>
            <select
              value={config.playerCount}
              onChange={e => setConfig({ ...config, playerCount: +e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2"
            >
              {[2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Games</label>
            <select
              value={config.gamesCount}
              onChange={e => setConfig({ ...config, gamesCount: +e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2"
            >
              {[1, 5, 10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n} games</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">AI Strategy</label>
            <select
              value={config.strategy}
              onChange={e => setConfig({ ...config, strategy: e.target.value as SimulationConfig['strategy'] })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2"
            >
              <option value="aggressive">Aggressive (Pro Line)</option>
              <option value="balanced">Balanced</option>
              <option value="conservative">Conservative</option>
            </select>
          </div>
        </div>

        <button
          onClick={run}
          disabled={running}
          className="w-full py-3 bg-emerald-600 rounded-lg font-bold text-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors mb-6"
        >
          {running ? 'Simulating...' : 'Run Simulation'}
        </button>

        {/* Results */}
        {stats && results && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="font-bold text-lg mb-3">Summary ({results.length} games)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Avg Progress (Winner)" value={stats.avgWinnerProgress.toFixed(1)} />
                <StatCard label="Avg Progress (All)" value={stats.avgProgress.toFixed(1)} />
                <StatCard label="Avg Penalties" value={stats.avgPenalties.toFixed(1)} />
                <StatCard label="Avg Momentum" value={stats.avgMomentum.toFixed(1)} />
              </div>
            </div>

            {/* Win Distribution */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="font-bold text-lg mb-3">Win Distribution</h2>
              <div className="space-y-2">
                {Object.entries(stats.winCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-24 text-sm">{name}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all"
                        style={{ width: `${(count / results.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm w-16 text-right">
                      {count} ({((count / results.length) * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Distribution */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="font-bold text-lg mb-3">Player Averages Across Games</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="py-2 text-left">Player</th>
                    <th className="text-right">Avg Progress</th>
                    <th className="text-right">Avg Perfect</th>
                    <th className="text-right">Avg Penalties</th>
                    <th className="text-right">Avg Flow</th>
                    <th className="text-right">Avg Momentum</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.playerAverages.map(pa => (
                    <tr key={pa.name} className="border-b border-gray-700/50">
                      <td className="py-1">{pa.name}</td>
                      <td className="text-right text-green-400">{pa.avgProgress.toFixed(1)}</td>
                      <td className="text-right text-yellow-400">{pa.avgPerfect.toFixed(1)}</td>
                      <td className="text-right text-orange-400">{pa.avgPenalties.toFixed(1)}</td>
                      <td className="text-right text-purple-400">{pa.avgFlow.toFixed(1)}</td>
                      <td className="text-right text-blue-400">{pa.avgMomentum.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Individual Game Results */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="font-bold text-lg mb-3">Game Results</h2>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-800">
                      <th className="py-1 text-left">Game</th>
                      <th className="text-left">Winner</th>
                      <th className="text-right">Progress</th>
                      <th className="text-right">Rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.gameNumber} className="border-b border-gray-700/30">
                        <td className="py-1">#{r.gameNumber}</td>
                        <td className="text-emerald-400">{r.winner}</td>
                        <td className="text-right">{r.finalStandings[0].progress}</td>
                        <td className="text-right">{r.totalRounds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-emerald-400">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}

function computeStats(results: SimulationResult[]) {
  const winCounts: Record<string, number> = {};
  let totalProgress = 0;
  let totalWinnerProgress = 0;
  let totalPenalties = 0;
  let totalMomentum = 0;
  let totalPlayers = 0;

  const playerTotals: Record<string, { progress: number; perfect: number; penalties: number; flow: number; momentum: number; count: number }> = {};

  for (const r of results) {
    winCounts[r.winner] = (winCounts[r.winner] || 0) + 1;
    totalWinnerProgress += r.finalStandings[0].progress;

    for (const s of r.finalStandings) {
      totalProgress += s.progress;
      totalPenalties += s.penalties;
      totalMomentum += s.momentum;
      totalPlayers++;

      if (!playerTotals[s.name]) {
        playerTotals[s.name] = { progress: 0, perfect: 0, penalties: 0, flow: 0, momentum: 0, count: 0 };
      }
      playerTotals[s.name].progress += s.progress;
      playerTotals[s.name].perfect += s.perfectMatches;
      playerTotals[s.name].penalties += s.penalties;
      playerTotals[s.name].flow += s.flow;
      playerTotals[s.name].momentum += s.momentum;
      playerTotals[s.name].count++;
    }
  }

  const playerAverages = Object.entries(playerTotals).map(([name, t]) => ({
    name,
    avgProgress: t.progress / t.count,
    avgPerfect: t.perfect / t.count,
    avgPenalties: t.penalties / t.count,
    avgFlow: t.flow / t.count,
    avgMomentum: t.momentum / t.count,
  }));

  return {
    winCounts,
    avgWinnerProgress: totalWinnerProgress / results.length,
    avgProgress: totalProgress / totalPlayers,
    avgPenalties: totalPenalties / totalPlayers,
    avgMomentum: totalMomentum / totalPlayers,
    playerAverages,
  };
}
