'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SimulationConfig, SimulationResult } from '@/lib/types';
import { runSingleGame, RoundSnapshot, BalanceSummary, computeBalanceSummary } from '@/lib/simulation';

export default function SimulatePage() {
  const [config, setConfig] = useState<SimulationConfig>({
    playerCount: 4,
    gamesCount: 10,
    strategy: 'balanced',
  });
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [allSnapshots, setAllSnapshots] = useState<RoundSnapshot[][]>([]);
  const [running, setRunning] = useState(false);
  const [currentGame, setCurrentGame] = useState(0);
  const [liveSnapshot, setLiveSnapshot] = useState<RoundSnapshot[] | null>(null);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const cancelRef = useRef(false);

  const run = useCallback(() => {
    setRunning(true);
    setResults([]);
    setAllSnapshots([]);
    setBalance(null);
    setCurrentGame(0);
    setLiveSnapshot(null);
    cancelRef.current = false;

    const newResults: SimulationResult[] = [];
    const newSnapshots: RoundSnapshot[][] = [];

    let gameIdx = 0;
    const runNext = () => {
      if (cancelRef.current || gameIdx >= config.gamesCount) {
        setRunning(false);
        if (newResults.length > 0) {
          setBalance(computeBalanceSummary(newResults, newSnapshots, config));
        }
        return;
      }

      const { result, roundSnapshots } = runSingleGame(config, gameIdx + 1);
      newResults.push(result);
      newSnapshots.push(roundSnapshots);

      setResults([...newResults]);
      setAllSnapshots([...newSnapshots]);
      setCurrentGame(gameIdx + 1);
      setLiveSnapshot(roundSnapshots);

      gameIdx++;
      // Yield to UI between games
      setTimeout(runNext, 0);
    };

    setTimeout(runNext, 0);
  }, [config]);

  const stop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return (
    <div className="min-h-screen game-table text-white p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Simulation Mode</h1>
        <p className="text-emerald-300/60 mb-6 text-sm">Run automated games to test balance and mechanics.</p>

        {/* Config */}
        <div className="trail-card p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Players</label>
            <select
              value={config.playerCount}
              onChange={e => setConfig({ ...config, playerCount: +e.target.value })}
              className="w-full bg-black/30 border border-gray-600 rounded px-3 py-2 text-white"
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} players</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Games</label>
            <select
              value={config.gamesCount}
              onChange={e => setConfig({ ...config, gamesCount: +e.target.value })}
              className="w-full bg-black/30 border border-gray-600 rounded px-3 py-2 text-white"
            >
              {[1, 5, 10, 25, 50, 100].map(n => <option key={n} value={n}>{n} games</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">AI Strategy</label>
            <select
              value={config.strategy}
              onChange={e => setConfig({ ...config, strategy: e.target.value as SimulationConfig['strategy'] })}
              className="w-full bg-black/30 border border-gray-600 rounded px-3 py-2 text-white"
            >
              <option value="aggressive">Aggressive (Pro Line)</option>
              <option value="balanced">Balanced</option>
              <option value="conservative">Conservative</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={run}
            disabled={running}
            className="flex-1 py-3 bg-emerald-700 rounded-lg font-bold text-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors border border-emerald-500"
          >
            {running ? `Simulating... ${currentGame}/${config.gamesCount}` : 'Run Simulation'}
          </button>
          {running && (
            <button
              onClick={stop}
              className="px-6 py-3 bg-red-900 rounded-lg font-bold hover:bg-red-800 border border-red-600"
            >
              Stop
            </button>
          )}
        </div>

        {/* Live Progress Bar */}
        {running && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress</span>
              <span>{currentGame}/{config.gamesCount}</span>
            </div>
            <div className="w-full bg-black/30 rounded-full h-3 overflow-hidden border border-gray-700">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-200"
                style={{ width: `${(currentGame / config.gamesCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Live Stats Strip */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            <LiveStat label="Games" value={results.length} />
            <LiveStat
              label="Avg Winner Prog"
              value={(results.reduce((s, r) => s + r.finalStandings[0].progress, 0) / results.length).toFixed(1)}
            />
            <LiveStat
              label="Avg Penalties"
              value={(results.reduce((s, r) => s + r.finalStandings.reduce((ss, f) => ss + f.penalties, 0), 0) / (results.length * config.playerCount)).toFixed(1)}
            />
            <LiveStat
              label="Avg Momentum"
              value={(results.reduce((s, r) => s + r.finalStandings.reduce((ss, f) => ss + f.momentum, 0), 0) / (results.length * config.playerCount)).toFixed(1)}
            />
            <LiveStat
              label="Avg Flow"
              value={(results.reduce((s, r) => s + r.finalStandings.reduce((ss, f) => ss + f.flow, 0), 0) / (results.length * config.playerCount)).toFixed(1)}
            />
          </div>
        )}

        {/* Last Game Round-by-Round Ticker */}
        {liveSnapshot && liveSnapshot.length > 0 && (
          <div className="trail-card p-4 mb-6">
            <h3 className="font-bold text-sm mb-2">
              Last Game (#{currentGame}) — Round-by-Round
            </h3>
            <div className="overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {liveSnapshot.map(snap => (
                  <div key={snap.round} className="text-center text-[10px] w-12 flex-shrink-0">
                    <div className="text-yellow-400 font-bold mb-0.5">R{snap.round}</div>
                    {snap.players.map(p => (
                      <div key={p.name} className={`${p.crashed ? 'text-red-400' : 'text-gray-300'}`}>
                        {p.progress}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1 min-w-max">
                <div className="w-12 text-[10px] text-gray-500 flex-shrink-0">Prog:</div>
                {liveSnapshot.length > 0 && liveSnapshot[0].players.map(p => (
                  <div key={p.name} className="text-[10px] text-gray-500">{p.name.replace('Player ', 'P')}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Balance Summary (shown after simulation completes) */}
        {balance && !running && (
          <div className="space-y-6">
            {/* Warnings / Insights */}
            <div className={`rounded-lg p-4 border-2 ${
              balance.warnings[0]?.includes('No major') ? 'border-emerald-600 bg-emerald-900/20' : 'border-yellow-600 bg-yellow-900/20'
            }`}>
              <h2 className="font-bold text-lg mb-2">
                {balance.warnings[0]?.includes('No major') ? 'Balance Check Passed' : 'Balance Warnings'}
              </h2>
              <ul className="space-y-1">
                {balance.warnings.map((w, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className={w.includes('No major') ? 'text-emerald-400' : 'text-yellow-400'}>
                      {w.includes('No major') ? '\u2713' : '\u26A0'}
                    </span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>

            {/* Key Metrics Grid */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3">Key Metrics ({balance.gamesPlayed} games, {balance.strategy})</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Winner Avg Progress" value={balance.avgWinnerProgress.toFixed(1)} color="text-emerald-400" />
                <MetricCard label="Loser Avg Progress" value={balance.avgLoserProgress.toFixed(1)} color="text-red-400" />
                <MetricCard label="Score Spread" value={balance.progressSpread.toFixed(1)} color="text-yellow-400" />
                <MetricCard label="P1 Advantage" value={`${(balance.firstPlayerAdvantage * 100).toFixed(1)}%`} color={Math.abs(balance.firstPlayerAdvantage) > 0.1 ? 'text-red-400' : 'text-gray-300'} />
                <MetricCard label="Obstacle Match Rate" value={`${(balance.obstacleMatchRate * 100).toFixed(0)}%`} color="text-blue-400" />
                <MetricCard label="Avg Penalties/Game" value={balance.avgPenaltiesPerGame.toFixed(1)} color="text-orange-400" />
                <MetricCard label="Avg Crashes/Game" value={balance.avgCrashesPerGame.toFixed(2)} color="text-red-300" />
                <MetricCard label="Avg Perfect Matches" value={balance.avgPerfectMatches.toFixed(1)} color="text-purple-400" />
                <MetricCard label="Avg Momentum (End)" value={balance.avgMomentumAtEnd.toFixed(1)} color="text-blue-300" />
                <MetricCard label="Avg Flow (End)" value={balance.avgFlowAtEnd.toFixed(1)} color="text-purple-300" />
                <MetricCard label="Avg Hand Size" value={balance.avgHandSizeAtEnd.toFixed(1)} color="text-gray-300" />
              </div>
            </div>

            {/* Win Distribution */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3">Win Distribution</h2>
              <div className="space-y-2">
                {Object.entries(balance.winDistribution).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-20 text-sm">{name}</span>
                    <div className="flex-1 bg-black/30 rounded-full h-5 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all"
                        style={{ width: `${(count / balance.gamesPlayed) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm w-20 text-right">
                      {count} ({((count / balance.gamesPlayed) * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Progression Curves (ASCII bar charts) */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3">Progression Curves (Avg per Round)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MiniChart label="Progress" data={balance.progressByRound} color="bg-emerald-500" maxVal={Math.max(...balance.progressByRound, 1)} />
                <MiniChart label="Momentum" data={balance.momentumByRound} color="bg-blue-500" maxVal={Math.max(...balance.momentumByRound, 1)} />
                <MiniChart label="Hazard Dice" data={balance.hazardByRound} color="bg-red-500" maxVal={Math.max(...balance.hazardByRound, 1)} />
              </div>
            </div>

            {/* Trail Card Difficulty */}
            {balance.trailCardDifficulty.length > 0 && (
              <div className="trail-card p-4">
                <h2 className="font-bold text-lg mb-3">Trail Card Difficulty</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-600">
                        <th className="py-1 text-left">Trail</th>
                        <th className="text-right">Avg Penalties</th>
                        <th className="text-right">Avg Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balance.trailCardDifficulty.map(t => (
                        <tr key={t.name} className="border-b border-gray-700/30">
                          <td className="py-1">{t.name}</td>
                          <td className="text-right text-orange-400">{t.avgPenalties.toFixed(2)}</td>
                          <td className="text-right text-green-400">{t.avgProgress.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Player Averages */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3">Player Averages</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-600">
                      <th className="py-2 text-left">Player</th>
                      <th className="text-right">Prog</th>
                      <th className="text-right">Perfect</th>
                      <th className="text-right">Pen</th>
                      <th className="text-right">Flow</th>
                      <th className="text-right">Mom</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balance.playerAverages.map(pa => (
                      <tr key={pa.name} className="border-b border-gray-700/30">
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
            </div>

            {/* Individual Game Results (collapsed by default) */}
            <details className="trail-card">
              <summary className="p-4 cursor-pointer font-bold text-lg hover:text-emerald-400 transition-colors">
                Individual Game Results ({results.length})
              </summary>
              <div className="px-4 pb-4">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-600 sticky top-0 bg-[#2a2218]">
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
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-black/30 rounded-lg p-2 text-center border border-gray-700">
      <div className="text-lg font-bold font-mono text-emerald-400">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function MiniChart({ label, data, color, maxVal }: { label: string; data: number[]; color: string; maxVal: number }) {
  return (
    <div>
      <div className="text-xs font-bold mb-2 text-gray-300">{label}</div>
      <div className="flex items-end gap-px h-20">
        {data.map((val, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end">
            <div
              className={`w-full ${color} rounded-t-sm min-h-[2px]`}
              style={{ height: `${maxVal > 0 ? (val / maxVal) * 100 : 0}%` }}
            />
            <div className="text-[8px] text-gray-500 mt-0.5">{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
