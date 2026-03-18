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
        avgWinnerShred: balance.avgWinnerShred,
        avgLoserShred: balance.avgLoserShred,
        shredSpread: balance.shredSpread,
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
        shredByRound: balance.shredByRound,
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
        shredGini: gini.shredGini,
        momentumGini: gini.momentumGini,
        flowGini: gini.flowGini,
        penaltyGini: gini.penaltyGini,
        verdict: gini.verdict,
        shredGiniByRound: gini.shredGiniByRound,
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

  const runMC = useCallback(async () => {
    setMcRunning(true);
    setMcResult(null);
    setMcProgress(0);
    mcCancelRef.current = false;

    try {
      await ensureMctsWasm();
    } catch (e) {
      alert('Failed to initialize MCTS WASM module: ' + e);
      setMcRunning(false);
      return;
    }

    const total = mcGames;
    const playerCount = config.playerCount;

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

    const runMCStep = async () => {
      if (cancelRef.current) { setRunAllActive(false); return; }
      setMcRunning(true);
      try {
        await ensureMctsWasm();
      } catch (e) {
        alert('Failed to initialize MCTS WASM module: ' + e);
        setMcRunning(false);
        setRunAllActive(false);
        return;
      }
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
        <h1 className="text-2xl sm:text-3xl font-bold mb-1 wpa-heading">Simulation Mode</h1>
        <p style={{ color: '#A08A6A' }} className="mb-6 text-sm">Run automated games to test balance and mechanics.</p>

        {/* Config */}
        <div className="trail-card p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: '#A08A6A' }}>Players</label>
            <select
              value={config.playerCount}
              onChange={e => setConfig({ ...config, playerCount: +e.target.value })}
              className="w-full rounded px-3 py-2 text-white" style={{ backgroundColor: 'rgba(13,27,42,0.5)', borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid' }}
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} players</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#A08A6A' }}>Games</label>
            <select
              value={config.gamesCount}
              onChange={e => setConfig({ ...config, gamesCount: +e.target.value })}
              className="w-full rounded px-3 py-2 text-white" style={{ backgroundColor: 'rgba(13,27,42,0.5)', borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid' }}
            >
              {[1, 5, 10, 25, 50, 100].map(n => <option key={n} value={n}>{n} games</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#A08A6A' }}>AI Strategy</label>
            <select
              value={config.strategy}
              onChange={e => setConfig({ ...config, strategy: e.target.value as SimulationConfig['strategy'] })}
              className="w-full rounded px-3 py-2 text-white" style={{ backgroundColor: 'rgba(13,27,42,0.5)', borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid' }}
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
            className="wpa-btn wpa-btn-primary flex-1 py-3 rounded-lg font-bold text-lg disabled:opacity-50 transition-colors"
          >
            {running && !runAllActive ? `Simulating... ${currentGame}/${config.gamesCount}` : 'Run Simulation'}
          </button>
          <button
            onClick={runAll}
            disabled={anyRunning}
            className="wpa-btn wpa-btn-secondary flex-1 py-3 rounded-lg font-bold text-lg disabled:opacity-50 transition-colors"
          >
            {runAllActive ? `Running All...` : 'Run All & Export'}
          </button>
          {anyRunning && (
            <button
              onClick={() => { cancelRef.current = true; stop(); }}
              className="px-6 py-3 rounded-lg font-bold transition-colors"
              style={{ backgroundColor: '#9A3A1A', borderColor: '#C35831', borderWidth: '1px', borderStyle: 'solid' }}
            >
              Stop
            </button>
          )}
        </div>

        {/* Run All Progress */}
        {runAllActive && (
          <div className="mb-6 rounded-lg p-3" style={{ borderColor: '#2E6B62', borderWidth: '1px', borderStyle: 'solid', backgroundColor: 'rgba(46,107,98,0.15)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-sm font-bold" style={{ color: '#E8D5B7' }}>Running Full Analysis Suite</div>
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
                    className={`rounded px-2 py-1.5 border ${active ? 'animate-pulse' : ''}`}
                    style={
                      done ? { borderColor: '#3A6B35', backgroundColor: 'rgba(58,107,53,0.2)', color: '#7BC47F' } :
                      active ? { borderColor: '#2E6B62', backgroundColor: 'rgba(46,107,98,0.3)', color: '#E8D5B7' } :
                      { borderColor: '#5C3D2E', backgroundColor: 'rgba(13,27,42,0.3)', color: '#A08A6A' }
                    }
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
            <div className="flex justify-between text-xs mb-1" style={{ color: '#A08A6A' }}>
              <span>Progress</span>
              <span>{currentGame}/{config.gamesCount}</span>
            </div>
            <div className="w-full rounded-full h-3 overflow-hidden" style={{ backgroundColor: 'rgba(13,27,42,0.5)', borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid' }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ backgroundColor: '#3A6B35', width: `${(currentGame / config.gamesCount) * 100}%` }}
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
              value={(results.reduce((s, r) => s + r.finalStandings[0].shred, 0) / results.length).toFixed(1)}
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
                    <div className="font-bold mb-0.5" style={{ color: '#D4A847' }}>R{snap.round}</div>
                    {snap.players.map(p => (
                      <div key={p.name} style={{ color: p.crashed ? '#E07070' : '#E8D5B7' }}>
                        {p.shred}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1 min-w-max">
                <div className="w-12 text-[10px] flex-shrink-0" style={{ color: '#A08A6A' }}>Shred:</div>
                {liveSnapshot.length > 0 && liveSnapshot[0].players.map(p => (
                  <div key={p.name} className="text-[10px]" style={{ color: '#A08A6A' }}>{p.name.replace('Player ', 'P')}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Export Panel — visible after any analysis completes */}
        {hasAnyData && !anyRunning && (
          <div className="trail-card p-4 mb-6" style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'rgba(46,107,98,0.5)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#E8D5B7' }}>Export Report</h3>
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
                  className="px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                  style={
                    exportCopied
                      ? { backgroundColor: '#3A6B35', borderColor: '#7BC47F', borderWidth: '1px', borderStyle: 'solid', color: 'white' }
                      : { backgroundColor: 'rgba(46,107,98,0.3)', borderColor: '#2E6B62', borderWidth: '1px', borderStyle: 'solid', color: '#E8D5B7' }
                  }
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
                  className="px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                  style={{ backgroundColor: '#5C3D2E', borderColor: '#8B5E3C', borderWidth: '1px', borderStyle: 'solid', color: '#E8D5B7' }}
                >
                  Download JSON
                </button>
              </div>
            </div>
            {/* Report contents summary */}
            <div className="flex flex-wrap gap-2 text-[10px]">
              {[
                { label: 'Simulation', active: results.length > 0, detail: `${results.length} games` },
                { label: 'Balance Summary', active: !!balance, detail: balance ? `Spread: ${balance.shredSpread.toFixed(1)}` : '' },
                { label: 'Gini Analysis', active: !!gini, detail: gini ? `Shred: ${gini.shredGini.toFixed(3)}` : '' },
                { label: 'Monte Carlo', active: !!mcResult, detail: mcResult ? `${mcResult.totalGames} games` : '' },
                { label: 'Sensitivity', active: !!sensitivity, detail: sensitivity ? `${sensitivity.length} params` : '' },
                { label: 'Obstacle Probs', active: true, detail: `${obsProbabilities.length} obstacles` },
              ].map(item => (
                <span
                  key={item.label}
                  className="px-2 py-1 rounded-full"
                  style={
                    item.active
                      ? { borderColor: '#3A6B35', borderWidth: '1px', borderStyle: 'solid', backgroundColor: 'rgba(58,107,53,0.2)', color: '#7BC47F' }
                      : { borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid', backgroundColor: 'rgba(0,0,0,0.2)', color: '#A08A6A' }
                  }
                >
                  {item.active ? '\u2713' : '\u2717'} {item.label}{item.active && item.detail ? ` (${item.detail})` : ''}
                </span>
              ))}
            </div>
            {(!balance || !mcResult || !sensitivity) && (
              <div className="text-[10px] mt-2 italic" style={{ color: '#A08A6A' }}>
                Some analyses haven&apos;t been run yet. Use &quot;Run All &amp; Export&quot; to generate a complete report.
              </div>
            )}
          </div>
        )}

        {/* Balance Summary (shown after simulation completes) */}
        {balance && !running && (
          <div className="space-y-6">
            {/* Warnings / Insights */}
            <div className="rounded-lg p-4" style={
              balance.warnings[0]?.includes('No major')
                ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#3A6B35', backgroundColor: 'rgba(58,107,53,0.15)' }
                : { borderWidth: '2px', borderStyle: 'solid', borderColor: '#D4A847', backgroundColor: 'rgba(212,168,71,0.1)' }
            }>
              <h2 className="font-bold text-lg mb-2 wpa-heading">
                {balance.warnings[0]?.includes('No major') ? 'Balance Check Passed' : 'Balance Warnings'}
              </h2>
              <ul className="space-y-1">
                {balance.warnings.map((w, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span style={{ color: w.includes('No major') ? '#7BC47F' : '#E0C860' }}>
                      {w.includes('No major') ? '\u2713' : '\u26A0'}
                    </span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>

            {/* Key Metrics Grid */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3 wpa-heading">Key Metrics ({balance.gamesPlayed} games, {balance.strategy})</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Winner Avg Shred" value={balance.avgWinnerShred.toFixed(1)} color="#7BC47F" />
                <MetricCard label="Loser Avg Shred" value={balance.avgLoserShred.toFixed(1)} color="#E07070" />
                <MetricCard label="Score Spread" value={balance.shredSpread.toFixed(1)} color="#E0C860" />
                <MetricCard label="P1 Advantage" value={`${(balance.firstPlayerAdvantage * 100).toFixed(1)}%`} color={Math.abs(balance.firstPlayerAdvantage) > 0.1 ? '#E07070' : '#E8D5B7'} />
                <MetricCard label="Obstacle Match Rate" value={`${(balance.obstacleMatchRate * 100).toFixed(0)}%`} color="#6BADE0" />
                <MetricCard label="Avg Penalties/Game" value={balance.avgPenaltiesPerGame.toFixed(1)} color="#E0875C" />
                <MetricCard label="Avg Crashes/Game" value={balance.avgCrashesPerGame.toFixed(2)} color="#E07070" />
                <MetricCard label="Avg Perfect Matches" value={balance.avgPerfectMatches.toFixed(1)} color="#B898D0" />
                <MetricCard label="Avg Momentum (End)" value={balance.avgMomentumAtEnd.toFixed(1)} color="#6BADE0" />
                <MetricCard label="Avg Flow (End)" value={balance.avgFlowAtEnd.toFixed(1)} color="#B898D0" />
                <MetricCard label="Avg Hand Size" value={balance.avgHandSizeAtEnd.toFixed(1)} color="#E8D5B7" />
              </div>
            </div>

            {/* Win Distribution */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3 wpa-heading">Win Distribution</h2>
              <div className="space-y-2">
                {Object.entries(balance.winDistribution).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-20 text-sm">{name}</span>
                    <div className="flex-1 rounded-full h-5 overflow-hidden" style={{ backgroundColor: 'rgba(13,27,42,0.5)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ backgroundColor: '#3A6B35', width: `${(count / balance.gamesPlayed) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm w-20 text-right">
                      {count} ({((count / balance.gamesPlayed) * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Shred Curves (ASCII bar charts) */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3 wpa-heading">Shred Curves (Avg per Round)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MiniChart label="Shred" data={balance.shredByRound} color="#7BC47F" maxVal={Math.max(...balance.shredByRound, 1)} />
                <MiniChart label="Momentum" data={balance.momentumByRound} color="#6BADE0" maxVal={Math.max(...balance.momentumByRound, 1)} />
                <MiniChart label="Hazard Dice" data={balance.hazardByRound} color="#E07070" maxVal={Math.max(...balance.hazardByRound, 1)} />
              </div>
            </div>

            {/* Trail Card Difficulty */}
            {balance.trailCardDifficulty.length > 0 && (
              <div className="trail-card p-4">
                <h2 className="font-bold text-lg mb-3 wpa-heading">Trail Card Difficulty</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr style={{ color: '#A08A6A', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#5C3D2E' }}>
                        <th className="py-1 text-left">Trail</th>
                        <th className="text-right">Avg Penalties</th>
                        <th className="text-right">Avg Shred</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balance.trailCardDifficulty.map(t => (
                        <tr key={t.name} style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgba(92,61,46,0.3)' }}>
                          <td className="py-1">{t.name}</td>
                          <td className="text-right" style={{ color: '#E0875C' }}>{t.avgPenalties.toFixed(2)}</td>
                          <td className="text-right" style={{ color: '#7BC47F' }}>{t.avgShred.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Player Averages */}
            <div className="trail-card p-4">
              <h2 className="font-bold text-lg mb-3 wpa-heading">Player Averages</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr style={{ color: '#A08A6A', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#5C3D2E' }}>
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
                      <tr key={pa.name} style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgba(92,61,46,0.3)' }}>
                        <td className="py-1">{pa.name}</td>
                        <td className="text-right" style={{ color: '#7BC47F' }}>{pa.avgShred.toFixed(1)}</td>
                        <td className="text-right" style={{ color: '#E0C860' }}>{pa.avgPerfect.toFixed(1)}</td>
                        <td className="text-right" style={{ color: '#E0875C' }}>{pa.avgPenalties.toFixed(1)}</td>
                        <td className="text-right" style={{ color: '#B898D0' }}>{pa.avgFlow.toFixed(1)}</td>
                        <td className="text-right" style={{ color: '#6BADE0' }}>{pa.avgMomentum.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Individual Game Results (collapsed by default) */}
            <details className="trail-card">
              <summary className="p-4 cursor-pointer font-bold text-lg transition-colors" style={{ color: '#E8D5B7' }}>
                Individual Game Results ({results.length})
              </summary>
              <div className="px-4 pb-4">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="sticky top-0" style={{ color: '#A08A6A', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#5C3D2E', backgroundColor: '#2a2218' }}>
                        <th className="py-1 text-left">Game</th>
                        <th className="text-left">Winner</th>
                        <th className="text-right">Progress</th>
                        <th className="text-right">Rounds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(r => (
                        <tr key={r.gameNumber} style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgba(92,61,46,0.3)' }}>
                          <td className="py-1">#{r.gameNumber}</td>
                          <td style={{ color: '#7BC47F' }}>{r.winner}</td>
                          <td className="text-right">{r.finalStandings[0].shred}</td>
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
        <div className="mt-10 pt-8" style={{ borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: '#5C3D2E' }}>
          <h2 className="text-xl sm:text-2xl font-bold mb-1 wpa-heading">Monte Carlo Analysis</h2>
          <p style={{ color: '#A08A6A' }} className="mb-4 text-sm">
            Run hundreds of games across all strategies to test fairness, balance, and convergence.
          </p>

          <div className="flex gap-3 items-end mb-6">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#A08A6A' }}>Total Games</label>
              <select
                value={mcGames}
                onChange={e => setMcGames(+e.target.value)}
                className="rounded px-3 py-2 text-white"
                style={{ backgroundColor: 'rgba(13,27,42,0.5)', borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid' }}
              >
                {[100, 300, 500, 1000, 2000].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button
              onClick={runMC}
              disabled={mcRunning}
              className="wpa-btn wpa-btn-secondary px-6 py-2.5 rounded-lg font-bold disabled:opacity-50 transition-colors"
            >
              {mcRunning ? 'Running...' : 'Run Monte Carlo'}
            </button>
          </div>

          {mcResult && (
            <div className="space-y-6">
              {/* Verdicts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg p-4" style={
                  mcResult.fairnessVerdict.includes('Excellent')
                    ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#3A6B35', backgroundColor: 'rgba(58,107,53,0.15)' }
                    : mcResult.fairnessVerdict.includes('Acceptable')
                    ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#D4A847', backgroundColor: 'rgba(212,168,71,0.1)' }
                    : { borderWidth: '2px', borderStyle: 'solid', borderColor: '#C35831', backgroundColor: 'rgba(195,88,49,0.1)' }
                }>
                  <div className="font-bold text-sm mb-1">Fairness</div>
                  <div className="text-xs">{mcResult.fairnessVerdict}</div>
                </div>
                <div className="rounded-lg p-4" style={
                  mcResult.strategyDominance.includes('balanced')
                    ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#3A6B35', backgroundColor: 'rgba(58,107,53,0.15)' }
                    : { borderWidth: '2px', borderStyle: 'solid', borderColor: '#D4A847', backgroundColor: 'rgba(212,168,71,0.1)' }
                }>
                  <div className="font-bold text-sm mb-1">Strategy Balance</div>
                  <div className="text-xs">{mcResult.strategyDominance}</div>
                </div>
              </div>

              {/* Key Monte Carlo Metrics */}
              <div className="trail-card p-4">
                <h3 className="font-bold text-lg mb-3 wpa-heading">Monte Carlo Results ({mcResult.totalGames} games)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label="P1 Win Rate" value={`${(mcResult.p1Confidence.mean * 100).toFixed(1)}%`} color={Math.abs(mcResult.p1Confidence.mean - 1/config.playerCount) > 0.1 ? '#E07070' : '#7BC47F'} />
                  <MetricCard label="95% CI" value={`${(mcResult.p1Confidence.lower * 100).toFixed(1)}-${(mcResult.p1Confidence.upper * 100).toFixed(1)}%`} color="#2E6B62" />
                  <MetricCard label="Snowball Rate" value={`${(mcResult.snowballCorrelation * 100).toFixed(0)}%`} color={mcResult.snowballCorrelation > 0.6 ? '#E07070' : '#7BC47F'} />
                  <MetricCard label="Obstacle Match" value={`${(mcResult.obstacleMatchRate * 100).toFixed(0)}%`} color="#6BADE0" />
                  <MetricCard label="Winner Avg Score" value={mcResult.scoreDistribution.winnerAvg.toFixed(1)} color="#7BC47F" />
                  <MetricCard label="Winner Std Dev" value={mcResult.scoreDistribution.winnerStdDev.toFixed(1)} color="#E8D5B7" />
                  <MetricCard label="Loser Avg Score" value={mcResult.scoreDistribution.loserAvg.toFixed(1)} color="#E07070" />
                  <MetricCard label="Loser Std Dev" value={mcResult.scoreDistribution.loserStdDev.toFixed(1)} color="#E8D5B7" />
                </div>
              </div>

              {/* Seat Win Rates */}
              <div className="trail-card p-4">
                <h3 className="font-bold text-sm mb-3">Win Rate by Seat Position</h3>
                <div className="space-y-2">
                  {mcResult.seatWinRates.map(s => (
                    <div key={s.seat} className="flex items-center gap-3">
                      <span className="w-20 text-xs">{s.seat}</span>
                      <div className="flex-1 rounded-full h-4 overflow-hidden" style={{ backgroundColor: 'rgba(13,27,42,0.5)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ backgroundColor: '#2E6B62', width: `${s.rate * 100}%` }}
                        />
                      </div>
                      <span className="text-xs w-24 text-right font-mono">
                        {s.wins} ({(s.rate * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] mt-2" style={{ color: '#A08A6A' }}>
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
                      <div className="flex-1 rounded-full h-4 overflow-hidden" style={{ backgroundColor: 'rgba(13,27,42,0.5)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            backgroundColor:
                              s.strategy === 'aggressive' ? '#C35831' :
                              s.strategy === 'conservative' ? '#1B2A4A' :
                              s.strategy === 'smart' ? '#2E6B62' :
                              s.strategy === 'mcts' ? '#D4A847' : '#3A6B35',
                            width: `${s.rate * 100}%`
                          }}
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
                      const barBg = deviation < 0.05 ? '#7BC47F' : deviation < 0.1 ? '#E0C860' : '#E07070';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end">
                          <div
                            className="w-full rounded-t-sm min-h-[2px]"
                            style={{ backgroundColor: barBg, height: `${Math.min(pt.p1WinRate * 200, 100)}%` }}
                          />
                          {i % Math.max(1, Math.floor(mcResult.convergenceData.length / 8)) === 0 && (
                            <div className="text-[7px] mt-0.5" style={{ color: '#A08A6A' }}>{pt.games}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: '#A08A6A' }}>
                    <span>Games played</span>
                    <span>Expected: {(100 / config.playerCount).toFixed(0)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ Theoretical Obstacle Match Probability ═══ */}
        <div className="mt-10 pt-8" style={{ borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: '#5C3D2E' }}>
          <h2 className="text-xl sm:text-2xl font-bold mb-1 wpa-heading">Theoretical Obstacle Match Probability</h2>
          <p style={{ color: '#A08A6A' }} className="mb-4 text-sm">
            Exact hypergeometric probability of matching each obstacle given hand size (deck: 20 cards, 5 per symbol).
          </p>
          <div className="trail-card p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr style={{ color: '#A08A6A', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#5C3D2E' }}>
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
                    <tr key={obs.name} style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgba(92,61,46,0.3)' }}>
                      <td className="py-1.5 font-medium">{obs.name}</td>
                      <td style={{ color: '#A08A6A' }}>{obs.symbols.join(', ')}</td>
                      <td className="text-center" style={{ color: '#A08A6A' }}>{obs.matchMode}</td>
                      {obs.byHandSize.map(entry => (
                        <td key={entry.handSize} className="text-center">
                          <span style={{
                            color: entry.probability > 0.8 ? '#7BC47F' :
                            entry.probability > 0.5 ? '#E0C860' :
                            '#E07070'
                          }}>
                            {(entry.probability * 100).toFixed(0)}%
                          </span>
                        </td>
                      ))}
                      <td className="text-center font-bold">
                        <span style={{
                          color: obs.weightedAvg > 0.7 ? '#7BC47F' :
                          obs.weightedAvg > 0.4 ? '#E0C860' :
                          '#E07070'
                        }}>
                          {(obs.weightedAvg * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] mt-3" style={{ color: '#A08A6A' }}>
              Weighted average uses estimated momentum distribution: 15% hand-2, 25% hand-3, 30% hand-4, 20% hand-5, 10% hand-6.
            </div>
          </div>
        </div>

        {/* ═══ Gini Coefficient Analysis ═══ */}
        {gini && !running && (
          <div className="mt-10 pt-8" style={{ borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: '#5C3D2E' }}>
            <h2 className="text-xl sm:text-2xl font-bold mb-1 wpa-heading">Gini Coefficient Analysis</h2>
            <p style={{ color: '#A08A6A' }} className="mb-4 text-sm">
              Measures inequality across players. 0 = perfect equality, 1 = one player has everything.
            </p>

            <div className="rounded-lg p-4 mb-4" style={
              gini.shredGini < 0.2
                ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#3A6B35', backgroundColor: 'rgba(58,107,53,0.15)' }
                : gini.shredGini < 0.35
                ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#D4A847', backgroundColor: 'rgba(212,168,71,0.1)' }
                : { borderWidth: '2px', borderStyle: 'solid', borderColor: '#C35831', backgroundColor: 'rgba(195,88,49,0.1)' }
            }>
              <div className="text-sm">{gini.verdict}</div>
            </div>

            <div className="trail-card p-4 mb-4">
              <h3 className="font-bold text-sm mb-3">Gini Coefficients by Metric</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <GiniBar label="Shred" value={gini.shredGini} />
                <GiniBar label="Momentum" value={gini.momentumGini} />
                <GiniBar label="Flow" value={gini.flowGini} />
                <GiniBar label="Penalties" value={gini.penaltyGini} />
              </div>
            </div>

            <div className="trail-card p-4">
              <h3 className="font-bold text-sm mb-3">Progress Inequality Over Time</h3>
              <div className="flex items-end gap-px h-24">
                {gini.shredGiniByRound.map((g, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className="w-full rounded-t-sm min-h-[2px]"
                      style={{ backgroundColor: g < 0.15 ? '#7BC47F' : g < 0.3 ? '#E0C860' : '#E07070', height: `${Math.min(g * 300, 100)}%` }}
                    />
                    <div className="text-[8px] mt-0.5" style={{ color: '#A08A6A' }}>{i + 1}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] mt-1" style={{ color: '#A08A6A' }}>
                <span>Round</span>
                <span>Higher = more unequal</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Sensitivity Analysis ═══ */}
        <div className="mt-10 pt-8" style={{ borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: '#5C3D2E' }}>
          <h2 className="text-xl sm:text-2xl font-bold mb-1 wpa-heading">Sensitivity Analysis</h2>
          <p style={{ color: '#A08A6A' }} className="mb-4 text-sm">
            Sweep key game parameters to see how they affect outcomes.
          </p>

          <div className="flex gap-3 items-end mb-6">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#A08A6A' }}>Games per Value</label>
              <select
                value={saGames}
                onChange={e => setSaGames(+e.target.value)}
                className="rounded px-3 py-2 text-white"
                style={{ backgroundColor: 'rgba(13,27,42,0.5)', borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid' }}
              >
                {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button
              onClick={runSA}
              disabled={saRunning}
              className="px-6 py-2.5 rounded-lg font-bold disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#B8922E', borderColor: '#D4A847', borderWidth: '1px', borderStyle: 'solid', color: '#0D1B2A' }}
            >
              {saRunning ? 'Running...' : 'Run Sensitivity Analysis'}
            </button>
          </div>

          {sensitivity && (
            <div className="space-y-4">
              {sensitivity.map(sr => (
                <div key={sr.param.id} className="trail-card p-4">
                  <h3 className="font-bold text-sm mb-1">{sr.param.label}</h3>
                  <p className="text-[10px] mb-3" style={{ color: '#A08A6A' }}>
                    Base value: {sr.param.baseValue} {sr.param.unit} — testing {sr.param.testValues.join(', ')}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ color: '#A08A6A', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#5C3D2E' }}>
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
                            <tr key={o.value} style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgba(92,61,46,0.3)', backgroundColor: isBase ? 'rgba(255,255,255,0.05)' : undefined }}>
                              <td className="py-1">
                                {o.value} {sr.param.unit}
                                {isBase && <span className="text-[10px] ml-1" style={{ color: '#7BC47F' }}>(base)</span>}
                              </td>
                              <td className="text-right" style={{ color: '#7BC47F' }}>{o.avgWinnerShred.toFixed(1)}</td>
                              <td className="text-right" style={{ color: '#E0875C' }}>{o.avgPenalties.toFixed(1)}</td>
                              <td className="text-right" style={{ color: '#E0C860' }}>{o.shredSpread.toFixed(1)}</td>
                              <td className="text-right" style={{ color: '#6BADE0' }}>{(o.obstacleMatchRate * 100).toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Mini visual: winner progress bar comparison */}
                  <div className="mt-2 space-y-1">
                    {sr.outcomes.map(o => {
                      const maxProg = Math.max(...sr.outcomes.map(x => x.avgWinnerShred), 1);
                      const isBase = o.value === sr.param.baseValue;
                      return (
                        <div key={o.value} className="flex items-center gap-2">
                          <span className="text-[10px] w-12 text-right" style={{ color: isBase ? '#7BC47F' : '#A08A6A', fontWeight: isBase ? 'bold' : 'normal' }}>
                            {o.value}
                          </span>
                          <div className="flex-1 rounded-full h-2.5 overflow-hidden" style={{ backgroundColor: 'rgba(13,27,42,0.5)' }}>
                            <div
                              className="h-full rounded-full"
                              style={{ backgroundColor: isBase ? '#3A6B35' : '#D4A847', width: `${(o.avgWinnerShred / maxProg) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] w-8" style={{ color: '#A08A6A' }}>{o.avgWinnerShred.toFixed(1)}</span>
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
    <div className="rounded-lg p-2 text-center" style={{ backgroundColor: 'rgba(13,27,42,0.5)', borderColor: '#5C3D2E', borderWidth: '1px', borderStyle: 'solid' }}>
      <div className="text-lg font-bold font-mono" style={{ color: '#7BC47F' }}>{value}</div>
      <div className="text-[10px]" style={{ color: '#A08A6A' }}>{label}</div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ backgroundColor: 'rgba(13,27,42,0.3)' }}>
      <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: '#A08A6A' }}>{label}</div>
    </div>
  );
}

function GiniBar({ label, value }: { label: string; value: number }) {
  const barColor = value < 0.15 ? '#7BC47F' : value < 0.3 ? '#E0C860' : '#E07070';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#A08A6A' }}>{label}</span>
        <span className="font-mono font-bold" style={{ color: barColor }}>{value.toFixed(3)}</span>
      </div>
      <div className="rounded-full h-3 overflow-hidden" style={{ backgroundColor: 'rgba(13,27,42,0.5)' }}>
        <div className="h-full rounded-full" style={{ backgroundColor: barColor, width: `${Math.min(value * 200, 100)}%` }} />
      </div>
    </div>
  );
}

function MiniChart({ label, data, color, maxVal }: { label: string; data: number[]; color: string; maxVal: number }) {
  return (
    <div>
      <div className="text-xs font-bold mb-2" style={{ color: '#E8D5B7' }}>{label}</div>
      <div className="flex items-end gap-px h-20">
        {data.map((val, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end">
            <div
              className="w-full rounded-t-sm min-h-[2px]"
              style={{ backgroundColor: color, height: `${maxVal > 0 ? (val / maxVal) * 100 : 0}%` }}
            />
            <div className="text-[8px] mt-0.5" style={{ color: '#A08A6A' }}>{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
