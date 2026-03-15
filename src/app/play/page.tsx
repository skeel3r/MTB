'use client';

import { useState, useCallback } from 'react';
import { GameState, GameAction } from '@/lib/types';
import { initGame, advancePhase, processAction, getStandings } from '@/lib/engine';
import { SYMBOL_EMOJI, SYMBOL_COLORS } from '@/lib/cards';
import GameBoard, { PlayerStats, HandDisplay } from '@/components/GameBoard';
import GameLog from '@/components/GameLog';

const PHASE_LABELS: Record<string, string> = {
  setup: 'Setup',
  scroll_descent: 'Scroll & Descent',
  commitment: 'Commitment',
  environment: 'Environment',
  preparation: 'Preparation',
  sprint: 'The Sprint',
  alignment: 'Alignment Check',
  reckoning: 'The Reckoning',
  stage_break: 'Stage Break',
  game_over: 'Game Over',
};

export default function PlayPage() {
  const [game, setGame] = useState<GameState | null>(null);
  const [playerNames, setPlayerNames] = useState(['Rider 1', 'Rider 2']);
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [mobileTab, setMobileTab] = useState<'actions' | 'board' | 'log'>('actions');

  const startGame = useCallback(() => {
    const names = playerNames.filter(n => n.trim());
    if (names.length < 1) return;
    setGame(initGame(names));
  }, [playerNames]);

  const doAdvance = useCallback(() => {
    if (!game) return;
    setGame(advancePhase(game));
  }, [game]);

  const doAction = useCallback((action: GameAction) => {
    if (!game) return;
    setGame(processAction(game, selectedPlayer, action));
  }, [game, selectedPlayer]);

  // ── Setup Screen ──
  if (!game) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-8">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">The Descent</h1>
          <p className="text-gray-400 mb-6">Set up your game</p>

          <div className="space-y-3 mb-6">
            {playerNames.map((name, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={name}
                  onChange={e => {
                    const n = [...playerNames];
                    n[i] = e.target.value;
                    setPlayerNames(n);
                  }}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder={`Player ${i + 1}`}
                />
                {playerNames.length > 1 && (
                  <button
                    onClick={() => setPlayerNames(playerNames.filter((_, j) => j !== i))}
                    className="px-3 py-2 bg-red-900 rounded hover:bg-red-800"
                  >
                    X
                  </button>
                )}
              </div>
            ))}
          </div>

          {playerNames.length < 6 && (
            <button
              onClick={() => setPlayerNames([...playerNames, `Rider ${playerNames.length + 1}`])}
              className="w-full py-2 mb-4 bg-gray-800 rounded hover:bg-gray-700 border border-gray-600"
            >
              + Add Player
            </button>
          )}

          <button
            onClick={startGame}
            className="w-full py-3 bg-emerald-600 rounded-lg font-bold text-lg hover:bg-emerald-500 transition-colors"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = game.players[selectedPlayer];
  const standings = getStandings(game);

  // ── Game Over ──
  if (game.phase === 'game_over') {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 text-center">Game Over!</h1>
          <p className="text-center text-emerald-400 text-lg sm:text-xl mb-6 sm:mb-8">
            Winner: {standings[0].name}
          </p>

          <div className="bg-gray-800 rounded-lg p-3 sm:p-4 mb-6 overflow-x-auto">
            <h2 className="font-bold mb-3">Final Standings</h2>
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="py-1 text-left">#</th>
                  <th className="text-left">Name</th>
                  <th>Prog</th>
                  <th className="hidden sm:table-cell">Perfect</th>
                  <th>Pen</th>
                  <th>Flow</th>
                  <th>Mom</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr key={s.name} className={s.rank === 1 ? 'text-emerald-400 font-bold' : ''}>
                    <td className="py-1">{s.rank}</td>
                    <td>{s.name}</td>
                    <td className="text-center">{s.progress}</td>
                    <td className="text-center hidden sm:table-cell">{s.perfectMatches}</td>
                    <td className="text-center">{s.penalties}</td>
                    <td className="text-center">{s.flow}</td>
                    <td className="text-center">{s.momentum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <GameLog log={game.log} />

          <button
            onClick={() => setGame(null)}
            className="mt-4 w-full py-3 bg-emerald-600 rounded-lg font-bold hover:bg-emerald-500"
          >
            New Game
          </button>
        </div>
      </div>
    );
  }

  // ── Actions Panel (shared between mobile and desktop) ──
  const actionsPanel = (
    <>
      {/* Phase-specific controls */}
      {game.phase === 'setup' && (
        <div className="space-y-3">
          <p className="text-gray-400">Game is set up. Click &quot;Next Phase&quot; to begin Round 1.</p>
        </div>
      )}

      {game.phase === 'commitment' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Choose Your Line</h2>
          <p className="text-gray-400 text-sm">Select line for each player, then advance.</p>
          <div className="flex gap-3">
            <button
              onClick={() => doAction({ type: 'commit_line', payload: { line: 'main' } })}
              className="flex-1 sm:flex-none px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 border border-gray-500"
            >
              <div className="font-bold">Main Line</div>
              <div className="text-xs text-gray-400">+1 Progress</div>
            </button>
            <button
              onClick={() => doAction({ type: 'commit_line', payload: { line: 'pro' } })}
              className="flex-1 sm:flex-none px-4 py-3 bg-red-900/50 rounded-lg hover:bg-red-900 border border-red-700"
            >
              <div className="font-bold text-red-400">Pro Line</div>
              <div className="text-xs text-gray-400">+2 Prog, No Brake</div>
            </button>
          </div>
        </div>
      )}

      {game.phase === 'sprint' && (
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-bold">
            Sprint - {currentPlayer.name}
            <span className="text-yellow-400 ml-2">({currentPlayer.actionsRemaining} Actions)</span>
          </h2>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <ActionButton
              label="Pedal (+1 Speed)"
              onClick={() => doAction({ type: 'pedal' })}
              disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.cannotPedal || currentPlayer.turnEnded}
              color="bg-blue-700 hover:bg-blue-600"
            />
            <ActionButton
              label="Brake (-1 Speed)"
              onClick={() => doAction({ type: 'brake' })}
              disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.cannotBrake || currentPlayer.commitment === 'pro' || currentPlayer.turnEnded}
              color="bg-orange-700 hover:bg-orange-600"
            />
            <ActionButton
              label="End Turn"
              onClick={() => doAction({ type: 'end_turn' })}
              disabled={currentPlayer.turnEnded}
              color="bg-gray-600 hover:bg-gray-500"
            />
          </div>

          {/* Steer Controls */}
          <div>
            <h3 className="text-sm font-bold mb-2">Steer (1 Action)</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-xs">
              {[0, 1, 2, 3, 4, 5].map(r => (
                <div key={r} className="flex gap-1">
                  <button
                    onClick={() => doAction({ type: 'steer', payload: { row: r, direction: -1 } })}
                    disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
                    className="px-1.5 sm:px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30 flex-1"
                  >
                    R{r + 1} &larr;
                  </button>
                  <button
                    onClick={() => doAction({ type: 'steer', payload: { row: r, direction: 1 } })}
                    disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
                    className="px-1.5 sm:px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30 flex-1"
                  >
                    R{r + 1} &rarr;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Obstacles */}
          {game.activeTrailCard && game.activeTrailCard.obstacles.length > 0 && (
            <div>
              <h3 className="text-sm font-bold mb-2">Obstacles (Free Action)</h3>
              <div className="flex flex-wrap gap-2">
                {game.activeTrailCard.obstacles.map((obs, i) => (
                  <button
                    key={i}
                    onClick={() => doAction({ type: 'tackle', payload: { obstacleIndex: i } })}
                    disabled={currentPlayer.turnEnded}
                    className="px-3 py-2 rounded-lg border-2 hover:border-white disabled:opacity-30 transition-colors"
                    style={{ borderColor: SYMBOL_COLORS[obs.symbols[0]], backgroundColor: SYMBOL_COLORS[obs.symbols[0]] + '20' }}
                  >
                    <div className="flex gap-1 justify-center">
                      {obs.symbols.map((sym, j) => (
                        <span key={j} className="text-lg">{SYMBOL_EMOJI[sym]}</span>
                      ))}
                    </div>
                    <div className="text-xs font-medium">{obs.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Flow Spending */}
          {currentPlayer.flow > 0 && (
            <div>
              <h3 className="text-sm font-bold mb-2">Spend Flow ({currentPlayer.flow})</h3>
              <div className="flex gap-2 flex-wrap">
                <ActionButton label="Ghost Copy (1)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'ghost_copy' } })} disabled={currentPlayer.flow < 1} color="bg-purple-700 hover:bg-purple-600" />
                <ActionButton label="Reroll (1)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'reroll' } })} disabled={currentPlayer.flow < 1} color="bg-purple-700 hover:bg-purple-600" />
                <ActionButton label="Brace (1)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'brace' } })} disabled={currentPlayer.flow < 1} color="bg-purple-700 hover:bg-purple-600" />
                <ActionButton label="Scrub (3)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'scrub' } })} disabled={currentPlayer.flow < 3} color="bg-purple-700 hover:bg-purple-600" />
              </div>
            </div>
          )}

          {/* Hand */}
          <div>
            <h3 className="text-sm font-bold mb-2">Hand (Play = 1 Action)</h3>
            <HandDisplay
              hand={currentPlayer.hand}
              onPlay={(i) => doAction({ type: 'technique', payload: { cardIndex: i } })}
              disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
            />
          </div>
        </div>
      )}

      {game.phase !== 'sprint' && game.phase !== 'commitment' && (
        <div className="text-gray-400 text-sm">
          {game.phase === 'scroll_descent' && 'Tokens shifted down. New trail section revealed.'}
          {game.phase === 'environment' && `${game.currentHazards.length} hazards applied to all players.`}
          {game.phase === 'preparation' && 'Cards drawn based on momentum.'}
          {game.phase === 'alignment' && 'Grid checked against trail card targets.'}
          {game.phase === 'reckoning' && 'Hazard dice rolled.'}
          {game.phase === 'stage_break' && 'Stage break! Regroup, Flow, Repair, Shop.'}
        </div>
      )}

      {/* Next Phase Button */}
      {game.phase !== 'sprint' && (game.phase as string) !== 'game_over' && (
        <button
          onClick={doAdvance}
          className="mt-4 w-full sm:w-auto px-6 py-3 bg-emerald-600 rounded-lg font-bold hover:bg-emerald-500 transition-colors"
        >
          Next Phase &rarr;
        </button>
      )}

      {game.phase === 'sprint' && game.players.every(p => p.turnEnded || p.crashed) && (
        <button
          onClick={doAdvance}
          className="mt-4 w-full sm:w-auto px-6 py-3 bg-emerald-600 rounded-lg font-bold hover:bg-emerald-500 transition-colors"
        >
          All turns done &mdash; Next Phase &rarr;
        </button>
      )}

      {/* Penalties */}
      {currentPlayer.penalties.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold mb-2 text-orange-400">Active Penalties</h3>
          <div className="flex flex-wrap gap-2">
            {currentPlayer.penalties.map((p, i) => (
              <div key={i} className="bg-orange-900/30 border border-orange-700 rounded px-2 py-1 text-xs">
                <div className="font-bold">{p.name}</div>
                <div className="text-gray-400">{p.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  // ── Main Game UI ──
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-700 px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">The Descent</h1>
            <span className="text-xs sm:text-sm text-gray-400">
              Round {game.round}/15 &middot; {PHASE_LABELS[game.phase]}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {game.activeTrailCard && (
              <div className="bg-gray-800 px-2 sm:px-3 py-1 rounded text-xs sm:text-sm">
                <span className="font-bold">{game.activeTrailCard.name}</span>{' '}
                <span className="text-yellow-400">(Lim:{game.activeTrailCard.speedLimit})</span>
              </div>
            )}
            {game.queuedTrailCard && (
              <div className="bg-gray-800 px-2 sm:px-3 py-1 rounded text-xs sm:text-sm hidden sm:block">
                <span className="text-gray-400">Next:</span> {game.queuedTrailCard.name}
              </div>
            )}
          </div>
        </div>

        {/* Player tabs */}
        <div className="flex gap-1 mt-2 overflow-x-auto">
          {game.players.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlayer(i)}
              className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
                i === selectedPlayer ? 'bg-emerald-600' : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="flex lg:hidden border-b border-gray-700 bg-gray-900">
        {(['actions', 'board', 'log'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2 text-sm font-bold capitalize transition-colors ${
              mobileTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden p-3">
        {mobileTab === 'actions' && (
          <div>
            {/* Compact stats bar */}
            <div className="grid grid-cols-4 gap-2 mb-3 text-center text-xs">
              <div className="bg-gray-800 rounded p-1.5">
                <div className="text-green-400 font-bold text-sm">{currentPlayer.progress}</div>
                <div className="text-gray-500">Prog</div>
              </div>
              <div className="bg-gray-800 rounded p-1.5">
                <div className="text-blue-400 font-bold text-sm">{currentPlayer.momentum}</div>
                <div className="text-gray-500">Speed</div>
              </div>
              <div className="bg-gray-800 rounded p-1.5">
                <div className="text-purple-400 font-bold text-sm">{currentPlayer.flow}</div>
                <div className="text-gray-500">Flow</div>
              </div>
              <div className="bg-gray-800 rounded p-1.5">
                <div className="text-red-400 font-bold text-sm">{currentPlayer.hazardDice}</div>
                <div className="text-gray-500">Hazard</div>
              </div>
            </div>
            {actionsPanel}
          </div>
        )}

        {mobileTab === 'board' && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <GameBoard
                player={currentPlayer}
                checkedRows={game.activeTrailCard?.checkedRows}
                targetLanes={game.activeTrailCard?.targetLanes}
                compact
              />
            </div>
            <PlayerStats player={currentPlayer} />
            <div className="bg-gray-800 rounded-lg p-3">
              <h3 className="font-bold text-sm mb-2">Standings</h3>
              {standings.map(s => (
                <div key={s.name} className="flex justify-between text-xs py-0.5">
                  <span>{s.rank}. {s.name}</span>
                  <span className="text-green-400">{s.progress} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mobileTab === 'log' && <GameLog log={game.log} />}
      </div>

      {/* Desktop layout */}
      <div className="hidden lg:flex">
        {/* Left panel: Board */}
        <div className="w-1/3 p-4 border-r border-gray-800">
          <GameBoard
            player={currentPlayer}
            checkedRows={game.activeTrailCard?.checkedRows}
            targetLanes={game.activeTrailCard?.targetLanes}
          />

          <div className="mt-3">
            <PlayerStats player={currentPlayer} />
          </div>

          {/* Standings */}
          <div className="mt-3 bg-gray-800 rounded-lg p-3">
            <h3 className="font-bold text-sm mb-2">Standings</h3>
            {standings.map(s => (
              <div key={s.name} className="flex justify-between text-xs py-0.5">
                <span>{s.rank}. {s.name}</span>
                <span className="text-green-400">{s.progress} pts</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Actions */}
        <div className="flex-1 p-4">
          {actionsPanel}
        </div>

        {/* Right panel: Log */}
        <div className="w-1/4 p-4 border-l border-gray-800">
          <h3 className="font-bold mb-2">Game Log</h3>
          <GameLog log={game.log} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  color,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm ${color} disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
    >
      {label}
    </button>
  );
}
