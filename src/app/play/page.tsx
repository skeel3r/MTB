'use client';

import { useState, useCallback } from 'react';
import { GameState, GameAction } from '@/lib/types';
import { initGame, advancePhase, processAction, getStandings } from '@/lib/engine';
import { SYMBOL_EMOJI, SYMBOL_COLORS, UPGRADES } from '@/lib/cards';
import GameBoard, { PlayerStats, HandDisplay, TrailCardDisplay } from '@/components/GameBoard';
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

  const startGame = useCallback(() => {
    const names = playerNames.filter(n => n.trim());
    if (names.length < 1) return;
    setGame(initGame(names));
  }, [playerNames]);

  const doAdvance = useCallback(() => {
    if (!game) return;
    setGame(advancePhase(game));
  }, [game]);

  const doAction = useCallback((action: GameAction, playerIndex?: number) => {
    if (!game) return;
    setGame(processAction(game, playerIndex ?? selectedPlayer, action));
  }, [game, selectedPlayer]);

  // ── Setup Screen ──
  if (!game) {
    return (
      <div className="min-h-screen game-table text-white p-4 sm:p-8">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">The Descent</h1>
          <p className="text-emerald-300/60 mb-6">Set up your game</p>

          <div className="trail-card p-6 mb-6">
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
                    className="flex-1 bg-black/30 border border-gray-600 rounded px-3 py-2 text-white"
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
                className="w-full py-2 mb-4 bg-black/20 rounded hover:bg-black/30 border border-gray-600"
              >
                + Add Player
              </button>
            )}
          </div>

          <button
            onClick={startGame}
            className="w-full py-3 bg-emerald-700 rounded-lg font-bold text-lg hover:bg-emerald-600 transition-colors border border-emerald-500"
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
      <div className="min-h-screen game-table text-white p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 text-center">Game Over!</h1>
          <p className="text-center text-emerald-400 text-lg sm:text-xl mb-6 sm:mb-8">
            Winner: {standings[0].name}
          </p>

          <div className="trail-card p-3 sm:p-4 mb-6 overflow-x-auto">
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

  // ── Tabletop Simulator Layout ──
  return (
    <div className="min-h-screen game-table text-white overflow-auto">
      {/* Top bar - compact info strip */}
      <div className="bg-black/50 border-b border-emerald-900/50 px-3 py-2 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-base sm:text-lg font-bold">The Descent</h1>
            <span className="text-xs text-gray-400">
              Round {game.round}/15 &middot; {PHASE_LABELS[game.phase]}
            </span>
          </div>
          <div className="flex gap-2 items-center">
            {/* Phase advance / next phase */}
            {game.phase !== 'sprint' && (game.phase as string) !== 'game_over' && (
              <button
                onClick={doAdvance}
                className="px-3 py-1.5 bg-emerald-600 rounded font-bold text-xs hover:bg-emerald-500 transition-colors"
              >
                Next Phase &rarr;
              </button>
            )}
            {game.phase === 'sprint' && game.players.every(p => p.turnEnded || p.crashed) && (
              <button
                onClick={doAdvance}
                className="px-3 py-1.5 bg-emerald-600 rounded font-bold text-xs hover:bg-emerald-500 transition-colors"
              >
                All done &rarr;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabletop surface */}
      <div className="p-3 sm:p-4">
        {/* ═══ TOP ZONE: Player grids + stats side by side ═══ */}
        <div className="flex flex-wrap gap-3 mb-4">
          {game.players.map((player, i) => (
            <div
              key={player.id}
              onClick={() => setSelectedPlayer(i)}
              className={`cursor-pointer rounded-lg p-2 transition-all ${
                i === selectedPlayer
                  ? 'ring-2 ring-emerald-400 bg-black/20'
                  : 'bg-black/10 hover:bg-black/15 opacity-80'
              }`}
            >
              <GameBoard
                player={player}
                checkedRows={game.activeTrailCard?.checkedRows}
                targetLanes={game.activeTrailCard?.targetLanes}
                compact
              />
              {/* Mini stats under each board */}
              <div className="grid grid-cols-4 gap-1 mt-1 text-center text-[10px]">
                <div><span className="text-green-400 font-bold">{player.progress}</span> <span className="text-gray-500">Prog</span></div>
                <div><span className="text-blue-400 font-bold">{player.momentum}</span> <span className="text-gray-500">Spd</span></div>
                <div><span className="text-purple-400 font-bold">{player.flow}</span> <span className="text-gray-500">Flow</span></div>
                <div><span className="text-red-400 font-bold">{player.hazardDice}</span> <span className="text-gray-500">Haz</span></div>
              </div>
            </div>
          ))}

          {/* Standings */}
          <div className="trail-card p-3 self-start min-w-[140px]">
            <h3 className="font-bold text-xs mb-2">Standings</h3>
            {standings.map(s => (
              <div key={s.name} className="flex justify-between text-xs py-0.5 gap-3">
                <span>{s.rank}. {s.name}</span>
                <span className="text-green-400 font-mono">{s.progress}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ MIDDLE ZONE: Table center - Trail Cards, Decks, Obstacles, Actions ═══ */}
        <div className="flex flex-wrap gap-4 mb-4">

          {/* Trail Cards */}
          <div className="flex-shrink-0">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">Trail</h3>
            <div className="flex gap-3 items-start">
              <TrailCardDisplay card={game.activeTrailCard} label="Active" />
              <TrailCardDisplay card={game.queuedTrailCard} label="Next" />
              {/* Trail deck count */}
              <div className="flex flex-col items-center gap-1">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Deck</div>
                <div
                  className="card-back deck-pile flex items-center justify-center"
                  style={{ width: '80px', height: '115px' }}
                >
                  <div className="text-white/80 text-xs font-bold bg-black/40 rounded px-2 py-1">
                    {game.trailDeck.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Obstacle Deck & Active Obstacles */}
          <div className="flex-shrink-0">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">Obstacle Zone</h3>
            <div className="flex gap-3 items-start">
              {/* Obstacle Deck (face-down draw pile) */}
              {game.phase === 'sprint' && (
                <button
                  onClick={() => doAction({ type: 'draw_obstacle' })}
                  disabled={currentPlayer.turnEnded}
                  className="deck-pile card-back flex flex-col items-center justify-center disabled:opacity-30 transition-transform hover:scale-105"
                  style={{ width: '90px', height: '125px' }}
                >
                  <div className="text-white text-xs font-bold text-center drop-shadow-md bg-black/40 rounded px-2 py-1">
                    Draw
                  </div>
                  <div className="text-white/60 text-[10px] mt-1">
                    {game.obstacleDeck.length} left
                  </div>
                </button>
              )}

              {/* Active obstacle cards */}
              {game.activeObstacles.map((obs, i) => (
                <button
                  key={i}
                  onClick={() => game.phase === 'sprint' ? doAction({ type: 'tackle', payload: { obstacleIndex: i } }) : undefined}
                  disabled={game.phase !== 'sprint' || currentPlayer.turnEnded}
                  className="obstacle-card flex flex-col items-center justify-center disabled:opacity-50"
                  style={{ width: '90px', height: '125px', padding: '8px' }}
                >
                  <div className="flex gap-1 mb-1">
                    {obs.symbols.map((sym, j) => (
                      <span key={j} className="text-2xl">{SYMBOL_EMOJI[sym]}</span>
                    ))}
                  </div>
                  <div className="text-xs font-bold text-center leading-tight">{obs.name}</div>
                  <div className="text-[9px] text-red-300/70 mt-1 text-center">{obs.penaltyType}</div>
                  {game.phase === 'sprint' && (
                    <div className="text-[8px] text-red-200/50 mt-auto">Tackle (free)</div>
                  )}
                </button>
              ))}

              {game.activeObstacles.length === 0 && game.phase === 'sprint' && (
                <div className="text-xs text-gray-500 italic self-center">Draw obstacles from the deck</div>
              )}
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex-1 min-w-[250px]">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">
              Actions &mdash; {currentPlayer.name}
              {game.phase === 'sprint' && (
                <span className="text-yellow-400 ml-1">({currentPlayer.actionsRemaining} left)</span>
              )}
            </h3>

            {game.phase === 'setup' && (
              <p className="text-gray-500 text-sm">Game is set up. Click &quot;Next Phase&quot; to begin.</p>
            )}

            {game.phase === 'commitment' && (
              <div className="flex gap-2">
                <button
                  onClick={() => doAction({ type: 'commit_line', payload: { line: 'main' } })}
                  className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 border border-gray-500"
                >
                  <div className="font-bold text-sm">Main Line</div>
                  <div className="text-[10px] text-gray-400">+1 Progress</div>
                </button>
                <button
                  onClick={() => doAction({ type: 'commit_line', payload: { line: 'pro' } })}
                  className="px-4 py-2 bg-red-900/50 rounded-lg hover:bg-red-900 border border-red-700"
                >
                  <div className="font-bold text-sm text-red-400">Pro Line</div>
                  <div className="text-[10px] text-gray-400">+2 Prog, No Brake</div>
                </button>
              </div>
            )}

            {game.phase === 'sprint' && (
              <div className="space-y-3">
                {/* Core action buttons */}
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label="Pedal (+1 Spd)"
                    onClick={() => doAction({ type: 'pedal' })}
                    disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.cannotPedal || currentPlayer.turnEnded}
                    color="bg-blue-700 hover:bg-blue-600"
                  />
                  <ActionButton
                    label="Brake (-1 Spd)"
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

                {/* Steer controls - compact grid */}
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">Steer (1 Action)</div>
                  <div className="grid grid-cols-6 gap-1 text-[10px]">
                    {[0, 1, 2, 3, 4, 5].map(r => (
                      <div key={r} className="flex gap-0.5">
                        <button
                          onClick={() => doAction({ type: 'steer', payload: { row: r, direction: -1 } })}
                          disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
                          className="px-1 py-0.5 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30 flex-1"
                        >
                          R{r + 1}&larr;
                        </button>
                        <button
                          onClick={() => doAction({ type: 'steer', payload: { row: r, direction: 1 } })}
                          disabled={currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
                          className="px-1 py-0.5 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30 flex-1"
                        >
                          R{r + 1}&rarr;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Flow spending */}
                {currentPlayer.flow > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">Spend Flow ({currentPlayer.flow})</div>
                    <div className="flex gap-1.5 flex-wrap">
                      <ActionButton label="Ghost (1)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'ghost_copy' } })} disabled={currentPlayer.flow < 1} color="bg-purple-700 hover:bg-purple-600" />
                      <ActionButton label="Reroll (1)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'reroll' } })} disabled={currentPlayer.flow < 1} color="bg-purple-700 hover:bg-purple-600" />
                      <ActionButton label="Brace (1)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'brace' } })} disabled={currentPlayer.flow < 1} color="bg-purple-700 hover:bg-purple-600" />
                      <ActionButton label="Scrub (3)" onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'scrub' } })} disabled={currentPlayer.flow < 3} color="bg-purple-700 hover:bg-purple-600" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {game.phase !== 'sprint' && game.phase !== 'commitment' && game.phase !== 'setup' && game.phase !== 'stage_break' && (
              <div className="text-gray-500 text-sm">
                {game.phase === 'scroll_descent' && 'Tokens shifted down. New trail section revealed.'}
                {game.phase === 'environment' && `${game.currentHazards.length} hazard(s) applied.`}
                {game.phase === 'preparation' && 'Cards drawn based on momentum.'}
                {game.phase === 'alignment' && 'Grid checked against trail card targets.'}
                {game.phase === 'reckoning' && 'Hazard dice rolled.'}
              </div>
            )}

            {/* Upgrade Shop during Stage Break */}
            {game.phase === 'stage_break' && (
              <div className="trail-card p-3">
                <h3 className="text-xs font-bold mb-2">Upgrade Shop</h3>
                {game.players.map((player, pi) => (
                  <div key={player.id} className="mb-3">
                    <div className="text-[10px] text-gray-400 mb-1">{player.name} — Flow: {player.flow}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {UPGRADES.map(upgrade => {
                        const owned = player.upgrades.some(u => u.id === upgrade.id);
                        const canAfford = player.flow >= upgrade.flowCost;
                        return (
                          <button
                            key={upgrade.id}
                            onClick={() => doAction({ type: 'buy_upgrade', payload: { upgradeId: upgrade.id } }, pi)}
                            disabled={owned || !canAfford}
                            className={`text-left p-1.5 text-[10px] transition-colors ${
                              owned ? 'upgrade-card opacity-60' :
                              canAfford ? 'upgrade-card' :
                              'upgrade-card opacity-40'
                            }`}
                          >
                            <div className="font-bold">{upgrade.name} <span className="text-yellow-400">({upgrade.flowCost}F)</span></div>
                            <div className="text-gray-400">{upgrade.description}</div>
                            {owned && <div className="text-emerald-400 text-[9px]">Owned</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ BOTTOM ZONE: Hand + Penalties + Game Log ═══ */}
        <div className="flex flex-wrap gap-4">
          {/* Player's Hand */}
          <div className="flex-1 min-w-[300px]">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">
              {currentPlayer.name}&apos;s Hand
              {game.phase === 'sprint' && <span className="text-gray-600 normal-case"> (Play = 1 Action)</span>}
            </h3>
            <HandDisplay
              hand={currentPlayer.hand}
              onPlay={game.phase === 'sprint' ? (i) => doAction({ type: 'technique', payload: { cardIndex: i } }) : undefined}
              disabled={game.phase !== 'sprint' || currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
              activeObstacles={game.activeObstacles}
            />
          </div>

          {/* Penalties */}
          {currentPlayer.penalties.length > 0 && (
            <div className="min-w-[150px]">
              <h3 className="text-xs font-bold mb-2 text-orange-400 uppercase tracking-wider">Penalties</h3>
              <div className="flex flex-wrap gap-1.5">
                {currentPlayer.penalties.map((p, i) => (
                  <div key={i} className="penalty-card px-2 py-1.5 text-xs">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-yellow-700/80 text-[10px]">{p.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Game Log */}
          <div className="min-w-[200px] w-full sm:w-auto sm:max-w-[300px]">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">Game Log</h3>
            <div className="max-h-[200px]">
              <GameLog log={game.log} />
            </div>
          </div>
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
      className={`px-3 py-1.5 rounded-lg font-bold text-xs ${color} disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
    >
      {label}
    </button>
  );
}
