'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SimulationConfig, SimulationResult } from '@/lib/types';
import {
  runSingleGame, RoundSnapshot, BalanceSummary, computeBalanceSummary,
  runMonteCarlo, MonteCarloResult,
  computeObstacleMatchProbabilities, ObstacleMatchProbability,
  computeGiniAnalysis, GiniAnalysis,
  runSensitivityAnalysis, SensitivityResult, SENSITIVITY_PARAMS,
  ensureMctsWasm,
} from '@/lib/simulation';

export default function SimulatePage() {
  const [config, setConfig] = useState<SimulationConfig>({
    playerCount: 4,
    gamesCount: 10,
    strategy: 'smart',
  });
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [allSnapshots, setAllSnapshots] = useState<RoundSnapshot[][]>([]);
  const [running, setRunning] = useState(false);
  const [currentGame, setCurrentGame] = useState(0);
  const [liveSnapshot, setLiveSnapshot] = useState<RoundSnapshot[] | null>(null);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [mcRunning, setMcRunning] = useState(false);
  const [gini, setGini] = useState<GiniAnalysis | null>(null);
  const [obsProbabilities] = useState<ObstacleMatchProbability[]>(() => computeObstacleMatchProbabilities());
  const [sensitivity, setSensitivity] = useState<SensitivityResult[] | null>(null);
  const [saRunning, setSaRunning] = useState(false);
  const [saGames, setSaGames] = useState(30);
  const [mcProgress, setMcProgress] = useState(0);
  const [mcGames, setMcGames] = useState(300);
  const [exportCopied, setExportCopied] = useState(false);
  const [runAllActive, setRunAllActive] = useState(false);
  const [runAllStep, setRunAllStep] = useState('');
  const cancelRef = useRef(false);
  const mcCancelRef = useRef(false);

  const generateReport = useCallback(() => {
    const report: Record<string, unknown> = {
      _meta: {
        generatedAt: new Date().toISOString(),
        gameVersion: '1.0',
        description: 'Flamme Rouge simulation analysis report. Share this with Claude for game balance suggestions.',
      },
      config: {
        playerCount: config.playerCount,
        gamesSimulated: results.length,
        strategy: config.strategy,
      },
    };

    if (balance) {
      report.balanceSummary = {
        avgWinnerProgress: balance.avgWinnerProgress,
        avgLoserProgress: balance.avgLoserProgress,
        progressSpread: balance.progressSpread,
        firstPlayerAdvantage: balance.firstPlayerAdvantage,
        obstacleMatchRate: balance.obstacleMatchRate,
        avgPenaltiesPerGame: balance.avgPenaltiesPerGame,
        avgCrashesPerGame: balance.avgCrashesPerGame,
        avgPerfectMatches: balance.avgPerfectMatches,
        avgMomentumAtEnd: balance.avgMomentumAtEnd,
        avgFlowAtEnd: balance.avgFlowAtEnd,
        avgHandSizeAtEnd: balance.avgHandSizeAtEnd,
        warnings: balance.warnings,
        winDistribution: balance.winDistribution,
        progressByRound: balance.progressByRound,
        momentumByRound: balance.momentumByRound,
        hazardByRound: balance.hazardByRound,
        trailCardDifficulty: balance.trailCardDifficulty,
        playerAverages: balance.playerAverages,
      };
    }

    if (results.length > 0) {
      // Per-game detail summary
      report.gameResults = results.map(r => ({
        game: r.gameNumber,
        winner: r.winner,
        rounds: r.totalRounds,
        standings: r.finalStandings,
      }));
    }

    if (mcResult) {
      report.monteCarlo = {
        totalGames: mcResult.totalGames,
        fairnessVerdict: mcResult.fairnessVerdict,
        strategyDominance: mcResult.strategyDominance,
        p1WinRate: mcResult.p1Confidence,
        snowballCorrelation: mcResult.snowballCorrelation,
        obstacleMatchRate: mcResult.obstacleMatchRate,
        scoreDistribution: mcResult.scoreDistribution,
        seatWinRates: mcResult.seatWinRates,
        strategyWinRates: mcResult.strategyWinRates,
      };
    }

    if (gini) {
      report.giniAnalysis = {
        progressGini: gini.progressGini,
        momentumGini: gini.momentumGini,
        flowGini: gini.flowGini,
        penaltyGini: gini.penaltyGini,
        verdict: gini.verdict,
        progressGiniByRound: gini.progressGiniByRound,
      };
    }

    if (sensitivity) {
      report.sensitivityAnalysis = sensitivity.map(sr => ({
        param: sr.param.label,
        baseValue: sr.param.baseValue,
        unit: sr.param.unit,
        outcomes: sr.outcomes,
      }));
    }

    report.obstacleMatchProbabilities = obsProbabilities.map(o => ({
      name: o.name,
      symbols: o.symbols,
      matchMode: o.matchMode,
      weightedAvg: o.weightedAvg,
      byHandSize: o.byHandSize,
    }));

    return report;
  }, [results, balance, mcResult, gini, sensitivity, obsProbabilities, config]);

  const run = useCallback(async () => {
    if (config.strategy === 'mcts') {
      try {
        await ensureMctsWasm();
      } catch (e) {
        alert('Failed to initialize MCTS WASM module: ' + e);
        return;
      }
    }
    setRunning(true);
    setResults([]);
    setAllSnapshots([]);
    setBalance(null);
    setGini(null);
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
          setGini(computeGiniAnalysis(newResults, newSnapshots));
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

  const runMC = useCallback(() => {
    setMcRunning(true);
    setMcResult(null);
    setMcProgress(0);
    mcCancelRef.current = false;

    // Run in batches to keep UI responsive
    let done = 0;
    const total = mcGames;
    const batchSize = 10;
    const playerCount = config.playerCount;

    // We run the full MC in chunks via setTimeout
    const partialResults: { result: ReturnType<typeof runSingleGame>['result']; snapshots: RoundSnapshot[] }[] = [];

    const runBatch = () => {
      if (mcCancelRef.current || done >= total) {
        // Compute final result
        const result = runMonteCarlo(playerCount, total);
        setMcResult(result);
        setMcRunning(false);
        return;
      }
      // Just update progress; the actual computation happens in runMonteCarlo at the end
      done += batchSize;
      if (done > total) done = total;
      setMcProgress(done);
      setTimeout(runBatch, 0);
    };

    // Since runMonteCarlo is synchronous, run it in one shot after a yield
    setTimeout(() => {
      const result = runMonteCarlo(playerCount, total, (d, t) => {
        // Can't update state from sync loop, but we capture final
      });
      setMcResult(result);
      setMcProgress(total);
      setMcRunning(false);
    }, 50);
  }, [mcGames, config.playerCount]);

  const runSA = useCallback(() => {
    setSaRunning(true);
    setSensitivity(null);
    setTimeout(() => {
      const result = runSensitivityAnalysis(config.playerCount, saGames);
      setSensitivity(result);
      setSaRunning(false);
    }, 50);
  }, [config.playerCount, saGames]);

  const anyRunning = running || mcRunning || saRunning || runAllActive;
  const hasAnyData = results.length > 0 || mcResult !== null || sensitivity !== null;

  // "Run All Analyses" — chains simulation → MC → sensitivity sequentially
  const runAll = useCallback(() => {
    setRunAllActive(true);
    setRunAllStep('simulation');
    cancelRef.current = false;

    // Clear previous results
    setResults([]);
    setAllSnapshots([]);
    setBalance(null);
    setGini(null);
    setMcResult(null);
    setSensitivity(null);
    setCurrentGame(0);
    setLiveSnapshot(null);
    setMcProgress(0);

    // Step 1: Run basic simulation
    setRunning(true);
    const newResults: SimulationResult[] = [];
    const newSnapshots: RoundSnapshot[][] = [];
    let gameIdx = 0;

    const runSimNext = () => {
      if (cancelRef.current) { setRunning(false); setRunAllActive(false); return; }
      if (gameIdx >= config.gamesCount) {
        setRunning(false);
        if (newResults.length > 0) {
          setBalance(computeBalanceSummary(newResults, newSnapshots, config));
          setGini(computeGiniAnalysis(newResults, newSnapshots));
        }
        // Step 2: Monte Carlo
        setRunAllStep('monte_carlo');
        setTimeout(runMCStep, 50);
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
      setTimeout(runSimNext, 0);
    };

    const runMCStep = () => {
      if (cancelRef.current) { setRunAllActive(false); return; }
      setMcRunning(true);
      setTimeout(() => {
        const mcRes = runMonteCarlo(config.playerCount, mcGames);
        setMcResult(mcRes);
        setMcProgress(mcGames);
        setMcRunning(false);

        // Step 3: Sensitivity
        setRunAllStep('sensitivity');
        setTimeout(runSAStep, 50);
      }, 50);
    };

    const runSAStep = () => {
      if (cancelRef.current) { setRunAllActive(false); return; }
      setSaRunning(true);
      setTimeout(() => {
        const saRes = runSensitivityAnalysis(config.playerCount, saGames);
        setSensitivity(saRes);
        setSaRunning(false);
        setRunAllStep('complete');
        setRunAllActive(false);
      }, 50);
    };

    setTimeout(runSimNext, 0);
  }, [config, mcGames, saGames]);

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
              <option value="smart">Smart (Evaluation AI)</option>
              <option value="aggressive">Aggressive (Pro Line)</option>
              <option value="balanced">Balanced (uses Smart AI)</option>
              <option value="conservative">Conservative</option>
              <option value="mcts">MCTS (Rust WASM)</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={run}
            disabled={anyRunning}
            className="flex-1 py-3 bg-emerald-700 rounded-lg font-bold text-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors border border-emerald-500"
          >
            {running && !runAllActive ? `Simulating... ${currentGame}/${config.gamesCount}` : 'Run Simulation'}
          </button>
          <button
            onClick={runAll}
            disabled={anyRunning}
            className="flex-1 py-3 bg-purple-700 rounded-lg font-bold text-lg hover:bg-purple-600 disabled:opacity-50 transition-colors border border-purple-500"
          >
            {runAllActive ? `Running All...` : 'Run All & Export'}
          </button>
          {anyRunning && (
            <button
              onClick={() => { cancelRef.current = true; stop(); }}
              className="px-6 py-3 bg-red-900 rounded-lg font-bold hover:bg-red-800 border border-red-600"
            >
              Stop
            </button>
          )}
        </div>

        {/* Run All Progress */}
        {runAllActive && (
          <div className="mb-6 rounded-lg p-3 border border-purple-600 bg-purple-900/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-sm font-bold text-purple-300">Running Full Analysis Suite</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { key: 'simulation', label: `Simulation (${config.gamesCount} games)` },
                { key: 'monte_carlo', label: `Monte Carlo (${mcGames} games)` },
                { key: 'sensitivity', label: 'Sensitivity Analysis' },
              ].map(step => {
                const done = step.key === 'simulation' ? (!running && results.length > 0)
                  : step.key === 'monte_carlo' ? (mcResult !== null)
                  : (sensitivity !== null);
                const active = runAllStep === step.key;
                return (
                  <div
                    key={step.key}
                    className={`rounded px-2 py-1.5 border ${
                      done ? 'border-emerald-600 bg-emerald-900/30 text-emerald-400' :
                      active ? 'border-purple-500 bg-purple-900/40 text-purple-300 animate-pulse' :
                      'border-gray-700 bg-black/20 text-gray-500'
                    }`}
                  >
                    {done ? '\u2713' : active ? '\u25B6' : '\u25CB'} {step.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

        {/* Export Panel — visible after any analysis completes */}
        {hasAnyData && !anyRunning && (
          <div className="trail-card p-4 mb-6 border-2 border-purple-600/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-purple-300 uppercase tracking-wider">Export Report</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const report = generateReport();
                    const text = '```json\n' + JSON.stringify(report, null, 2) + '\n```';
                    navigator.clipboard.writeText(text).then(() => {
                      setExportCopied(true);
                      setTimeout(() => setExportCopied(false), 2000);
                    });
                  }}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors border ${
                    exportCopied
                      ? 'bg-emerald-700 border-emerald-500 text-white'
                      : 'bg-purple-900/50 border-purple-600 hover:bg-purple-800 text-purple-300'
                  }`}
                >
                  {exportCopied ? 'Copied!' : 'Copy for Claude'}
                </button>
                <button
                  onClick={() => {
                    const report = generateReport();
                    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `simulation-report-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 border border-gray-500 text-gray-300 transition-colors"
                >
                  Download JSON
                </button>
              </div>
            </div>
            {/* Report contents summary */}
            <div className="flex flex-wrap gap-2 text-[10px]">
              {[
                { label: 'Simulation', active: results.length > 0, detail: `${results.length} games` },
                { label: 'Balance Summary', active: !!balance, detail: balance ? `Spread: ${balance.progressSpread.toFixed(1)}` : '' },
                { label: 'Gini Analysis', active: !!gini, detail: gini ? `Prog: ${gini.progressGini.toFixed(3)}` : '' },
                { label: 'Monte Carlo', active: !!mcResult, detail: mcResult ? `${mcResult.totalGames} games` : '' },
                { label: 'Sensitivity', active: !!sensitivity, detail: sensitivity ? `${sensitivity.length} params` : '' },
                { label: 'Obstacle Probs', active: true, detail: `${obsProbabilities.length} obstacles` },
              ].map(item => (
                <span
                  key={item.label}
                  className={`px-2 py-1 rounded-full border ${
                    item.active
                      ? 'border-emerald-600 bg-emerald-900/30 text-emerald-400'
                      : 'border-gray-700 bg-black/20 text-gray-600'
                  }`}
                >
                  {item.active ? '\u2713' : '\u2717'} {item.label}{item.active && item.detail ? ` (${item.detail})` : ''}
                </span>
              ))}
            </div>
            {(!balance || !mcResult || !sensitivity) && (
              <div className="text-[10px] text-gray-500 mt-2 italic">
                Some analyses haven&apos;t been run yet. Use &quot;Run All &amp; Export&quot; to generate a complete report.
              </div>
            )}
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
        {/* ═══ Monte Carlo Section ═══ */}
        <div className="mt-10 pt-8 border-t-2 border-gray-700">
          <h2 className="text-xl sm:text-2xl font-bold mb-1">Monte Carlo Analysis</h2>
          <p className="text-emerald-300/60 mb-4 text-sm">
            Run hundreds of games across all strategies to test fairness, balance, and convergence.
          </p>

          <div className="flex gap-3 items-end mb-6">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Total Games</label>
              <select
                value={mcGames}
                onChange={e => setMcGames(+e.target.value)}
                className="bg-black/30 border border-gray-600 rounded px-3 py-2 text-white"
              >
                {[100, 300, 500, 1000, 2000].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button
              onClick={runMC}
              disabled={mcRunning}
              className="px-6 py-2.5 bg-cyan-700 rounded-lg font-bold hover:bg-cyan-600 disabled:opacity-50 transition-colors border border-cyan-500"
            >
              {mcRunning ? 'Running...' : 'Run Monte Carlo'}
            </button>
          </div>

          {mcResult && (
            <div className="space-y-6">
              {/* Verdicts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-lg p-4 border-2 ${mcResult.fairnessVerdict.includes('Excellent') ? 'border-emerald-600 bg-emerald-900/20' : mcResult.fairnessVerdict.includes('Acceptable') ? 'border-yellow-600 bg-yellow-900/20' : 'border-red-600 bg-red-900/20'}`}>
                  <div className="font-bold text-sm mb-1">Fairness</div>
                  <div className="text-xs">{mcResult.fairnessVerdict}</div>
                </div>
                <div className={`rounded-lg p-4 border-2 ${mcResult.strategyDominance.includes('balanced') ? 'border-emerald-600 bg-emerald-900/20' : 'border-yellow-600 bg-yellow-900/20'}`}>
                  <div className="font-bold text-sm mb-1">Strategy Balance</div>
                  <div className="text-xs">{mcResult.strategyDominance}</div>
                </div>
              </div>

              {/* Key Monte Carlo Metrics */}
              <div className="trail-card p-4">
                <h3 className="font-bold text-lg mb-3">Monte Carlo Results ({mcResult.totalGames} games)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label="P1 Win Rate" value={`${(mcResult.p1Confidence.mean * 100).toFixed(1)}%`} color={Math.abs(mcResult.p1Confidence.mean - 1/config.playerCount) > 0.1 ? 'text-red-400' : 'text-emerald-400'} />
                  <MetricCard label="95% CI" value={`${(mcResult.p1Confidence.lower * 100).toFixed(1)}-${(mcResult.p1Confidence.upper * 100).toFixed(1)}%`} color="text-cyan-400" />
                  <MetricCard label="Snowball Rate" value={`${(mcResult.snowballCorrelation * 100).toFixed(0)}%`} color={mcResult.snowballCorrelation > 0.6 ? 'text-red-400' : 'text-emerald-400'} />
                  <MetricCard label="Obstacle Match" value={`${(mcResult.obstacleMatchRate * 100).toFixed(0)}%`} color="text-blue-400" />
                  <MetricCard label="Winner Avg Score" value={mcResult.scoreDistribution.winnerAvg.toFixed(1)} color="text-emerald-400" />
                  <MetricCard label="Winner Std Dev" value={mcResult.scoreDistribution.winnerStdDev.toFixed(1)} color="text-gray-300" />
                  <MetricCard label="Loser Avg Score" value={mcResult.scoreDistribution.loserAvg.toFixed(1)} color="text-red-400" />
                  <MetricCard label="Loser Std Dev" value={mcResult.scoreDistribution.loserStdDev.toFixed(1)} color="text-gray-300" />
                </div>
              </div>

              {/* Seat Win Rates */}
              <div className="trail-card p-4">
                <h3 className="font-bold text-sm mb-3">Win Rate by Seat Position</h3>
                <div className="space-y-2">
                  {mcResult.seatWinRates.map(s => (
                    <div key={s.seat} className="flex items-center gap-3">
                      <span className="w-20 text-xs">{s.seat}</span>
                      <div className="flex-1 bg-black/30 rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-cyan-600 h-full rounded-full transition-all"
                          style={{ width: `${s.rate * 100}%` }}
                        />
                      </div>
                      <span className="text-xs w-24 text-right font-mono">
                        {s.wins} ({(s.rate * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-gray-500 mt-2">
                  Expected: {(100 / config.playerCount).toFixed(1)}% per seat
                </div>
              </div>

              {/* Strategy Win Rates */}
              <div className="trail-card p-4">
                <h3 className="font-bold text-sm mb-3">Win Rate by Strategy (P1)</h3>
                <div className="space-y-2">
                  {mcResult.strategyWinRates.map(s => (
                    <div key={s.strategy} className="flex items-center gap-3">
                      <span className="w-24 text-xs capitalize">{s.strategy}</span>
                      <div className="flex-1 bg-black/30 rounded-full h-4 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.strategy === 'aggressive' ? 'bg-red-600' :
                            s.strategy === 'conservative' ? 'bg-blue-600' :
                            s.strategy === 'smart' ? 'bg-purple-600' : 'bg-emerald-600'
                          }`}
                          style={{ width: `${s.rate * 100}%` }}
                        />
                      </div>
                      <span className="text-xs w-28 text-right font-mono">
                        {s.wins}/{s.games} ({(s.rate * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Convergence Chart */}
              {mcResult.convergenceData.length > 1 && (
                <div className="trail-card p-4">
                  <h3 className="font-bold text-sm mb-3">P1 Win Rate Convergence</h3>
                  <div className="flex items-end gap-px h-32">
                    {mcResult.convergenceData.map((pt, i) => {
                      const expectedRate = 1 / config.playerCount;
                      const deviation = Math.abs(pt.p1WinRate - expectedRate);
                      const barColor = deviation < 0.05 ? 'bg-emerald-500' : deviation < 0.1 ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end">
                          <div
                            className={`w-full ${barColor} rounded-t-sm min-h-[2px]`}
                            style={{ height: `${Math.min(pt.p1WinRate * 200, 100)}%` }}
                          />
                          {i % Math.max(1, Math.floor(mcResult.convergenceData.length / 8)) === 0 && (
                            <div className="text-[7px] text-gray-500 mt-0.5">{pt.games}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                    <span>Games played</span>
                    <span>Expected: {(100 / config.playerCount).toFixed(0)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ Theoretical Obstacle Match Probability ═══ */}
        <div className="mt-10 pt-8 border-t-2 border-gray-700">
          <h2 className="text-xl sm:text-2xl font-bold mb-1">Theoretical Obstacle Match Probability</h2>
          <p className="text-emerald-300/60 mb-4 text-sm">
            Exact hypergeometric probability of matching each obstacle given hand size (deck: 20 cards, 5 per symbol).
          </p>
          <div className="trail-card p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-600">
                    <th className="py-2 text-left">Obstacle</th>
                    <th className="text-left">Symbols</th>
                    <th className="text-center">Mode</th>
                    {[2, 3, 4, 5, 6].map(h => (
                      <th key={h} className="text-center w-16">Hand {h}</th>
                    ))}
                    <th className="text-center w-16">Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {obsProbabilities.map(obs => (
                    <tr key={obs.name} className="border-b border-gray-700/30">
                      <td className="py-1.5 font-medium">{obs.name}</td>
                      <td className="text-gray-400">{obs.symbols.join(', ')}</td>
                      <td className="text-center text-gray-500">{obs.matchMode}</td>
                      {obs.byHandSize.map(entry => (
                        <td key={entry.handSize} className="text-center">
                          <span className={
                            entry.probability > 0.8 ? 'text-emerald-400' :
                            entry.probability > 0.5 ? 'text-yellow-400' :
                            'text-red-400'
                          }>
                            {(entry.probability * 100).toFixed(0)}%
                          </span>
                        </td>
                      ))}
                      <td className="text-center font-bold">
                        <span className={
                          obs.weightedAvg > 0.7 ? 'text-emerald-400' :
                          obs.weightedAvg > 0.4 ? 'text-yellow-400' :
                          'text-red-400'
                        }>
                          {(obs.weightedAvg * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-gray-500 mt-3">
              Weighted average uses estimated momentum distribution: 15% hand-2, 25% hand-3, 30% hand-4, 20% hand-5, 10% hand-6.
            </div>
          </div>
        </div>

        {/* ═══ Gini Coefficient Analysis ═══ */}
        {gini && !running && (
          <div className="mt-10 pt-8 border-t-2 border-gray-700">
            <h2 className="text-xl sm:text-2xl font-bold mb-1">Gini Coefficient Analysis</h2>
            <p className="text-emerald-300/60 mb-4 text-sm">
              Measures inequality across players. 0 = perfect equality, 1 = one player has everything.
            </p>

            <div className={`rounded-lg p-4 border-2 mb-4 ${
              gini.progressGini < 0.2 ? 'border-emerald-600 bg-emerald-900/20' :
              gini.progressGini < 0.35 ? 'border-yellow-600 bg-yellow-900/20' :
              'border-red-600 bg-red-900/20'
            }`}>
              <div className="text-sm">{gini.verdict}</div>
            </div>

            <div className="trail-card p-4 mb-4">
              <h3 className="font-bold text-sm mb-3">Gini Coefficients by Metric</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <GiniBar label="Progress" value={gini.progressGini} />
                <GiniBar label="Momentum" value={gini.momentumGini} />
                <GiniBar label="Flow" value={gini.flowGini} />
                <GiniBar label="Penalties" value={gini.penaltyGini} />
              </div>
            </div>

            <div className="trail-card p-4">
              <h3 className="font-bold text-sm mb-3">Progress Inequality Over Time</h3>
              <div className="flex items-end gap-px h-24">
                {gini.progressGiniByRound.map((g, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className={`w-full rounded-t-sm min-h-[2px] ${
                        g < 0.15 ? 'bg-emerald-500' : g < 0.3 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ height: `${Math.min(g * 300, 100)}%` }}
                    />
                    <div className="text-[8px] text-gray-500 mt-0.5">{i + 1}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                <span>Round</span>
                <span>Higher = more unequal</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Sensitivity Analysis ═══ */}
        <div className="mt-10 pt-8 border-t-2 border-gray-700">
          <h2 className="text-xl sm:text-2xl font-bold mb-1">Sensitivity Analysis</h2>
          <p className="text-emerald-300/60 mb-4 text-sm">
            Sweep key game parameters to see how they affect outcomes.
          </p>

          <div className="flex gap-3 items-end mb-6">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Games per Value</label>
              <select
                value={saGames}
                onChange={e => setSaGames(+e.target.value)}
                className="bg-black/30 border border-gray-600 rounded px-3 py-2 text-white"
              >
                {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button
              onClick={runSA}
              disabled={saRunning}
              className="px-6 py-2.5 bg-amber-700 rounded-lg font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors border border-amber-500"
            >
              {saRunning ? 'Running...' : 'Run Sensitivity Analysis'}
            </button>
          </div>

          {sensitivity && (
            <div className="space-y-4">
              {sensitivity.map(sr => (
                <div key={sr.param.id} className="trail-card p-4">
                  <h3 className="font-bold text-sm mb-1">{sr.param.label}</h3>
                  <p className="text-[10px] text-gray-500 mb-3">
                    Base value: {sr.param.baseValue} {sr.param.unit} — testing {sr.param.testValues.join(', ')}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-600">
                          <th className="py-1 text-left">{sr.param.label}</th>
                          <th className="text-right">Winner Prog</th>
                          <th className="text-right">Penalties</th>
                          <th className="text-right">Spread</th>
                          <th className="text-right">Match Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sr.outcomes.map(o => {
                          const isBase = o.value === sr.param.baseValue;
                          return (
                            <tr key={o.value} className={`border-b border-gray-700/30 ${isBase ? 'bg-white/5' : ''}`}>
                              <td className="py-1">
                                {o.value} {sr.param.unit}
                                {isBase && <span className="text-emerald-400 text-[10px] ml-1">(base)</span>}
                              </td>
                              <td className="text-right text-emerald-400">{o.avgWinnerProgress.toFixed(1)}</td>
                              <td className="text-right text-orange-400">{o.avgPenalties.toFixed(1)}</td>
                              <td className="text-right text-yellow-400">{o.progressSpread.toFixed(1)}</td>
                              <td className="text-right text-blue-400">{(o.obstacleMatchRate * 100).toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Mini visual: winner progress bar comparison */}
                  <div className="mt-2 space-y-1">
                    {sr.outcomes.map(o => {
                      const maxProg = Math.max(...sr.outcomes.map(x => x.avgWinnerProgress), 1);
                      const isBase = o.value === sr.param.baseValue;
                      return (
                        <div key={o.value} className="flex items-center gap-2">
                          <span className={`text-[10px] w-12 text-right ${isBase ? 'text-emerald-400 font-bold' : 'text-gray-500'}`}>
                            {o.value}
                          </span>
                          <div className="flex-1 bg-black/30 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isBase ? 'bg-emerald-500' : 'bg-amber-600'}`}
                              style={{ width: `${(o.avgWinnerProgress / maxProg) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 w-8">{o.avgWinnerProgress.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

function GiniBar({ label, value }: { label: string; value: number }) {
  const color = value < 0.15 ? 'bg-emerald-500' : value < 0.3 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = value < 0.15 ? 'text-emerald-400' : value < 0.3 ? 'text-yellow-400' : 'text-red-400';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className={`font-mono font-bold ${textColor}`}>{value.toFixed(3)}</span>
      </div>
      <div className="bg-black/30 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value * 200, 100)}%` }} />
      </div>
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
