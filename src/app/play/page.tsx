'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, GameAction, PlayerState, UpgradeType } from '@/lib/types';
import { initGame, advancePhase, processAction, getStandings } from '@/lib/engine';
import {
  SYMBOL_EMOJI, SYMBOL_COLORS,
  getTechniqueSymbol, getTechniqueName, getTechniqueActionText,
  getObstacleSymbols, getObstacleName, getObstaclePenaltyType, getObstacleMatchMode, getObstacleSendItCost,
  getPenaltyName, getPenaltyDescription,
  getTrailStageCheckedRows, getTrailStageTargetLanes,
  ALL_UPGRADE_TYPES, UPGRADE_PROPERTIES,
} from '@/lib/cards';
import { aiPlaySprint, aiCommit } from '@/lib/ai-player';
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
  const [isAI, setIsAI] = useState([false, true]); // second player is AI by default
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [selectedSteerRow, setSelectedSteerRow] = useState<number | null>(null);
  const [effectToast, setEffectToast] = useState<{ cardName: string; text: string; color: string } | null>(null);
  const aiProcessingRef = useRef(false);
  const aiCommittedRoundRef = useRef(-1);

  const startGame = useCallback(() => {
    const names = playerNames.filter(n => n.trim());
    if (names.length < 1) return;
    setGame(initGame(names));
  }, [playerNames]);

  const doAdvance = useCallback(() => {
    if (!game) return;
    setSelectedSteerRow(null);
    setGame(advancePhase(game));
  }, [game]);

  const doAction = useCallback((action: GameAction, playerIndex?: number) => {
    if (!game) return;

    // Capture technique card info before it's removed from hand
    if (action.type === 'technique') {
      const pi = playerIndex ?? selectedPlayer;
      const ci = (action.payload?.cardIndex as number) ?? 0;
      const card = game.players[pi]?.hand[ci];
      if (card) {
        const cardName = getTechniqueName(card);
        const cardSymbol = getTechniqueSymbol(card);
        const cardActionText = getTechniqueActionText(card);
        const EFFECT_DESCRIPTIONS: Record<string, string> = {
          'Inside Line': 'Grip immunity + Momentum boost',
          'Manual': 'Swap rows 1 & 2 + draw a card',
          'Flick': 'Shift tokens toward center',
          'Recover': 'Remove dice or repair penalty',
        };

        setEffectToast({
          cardName,
          text: EFFECT_DESCRIPTIONS[cardName] || cardActionText,
          color: SYMBOL_COLORS[cardSymbol],
        });
        setTimeout(() => setEffectToast(null), 3000);
      }
    }

    setGame(processAction(game, playerIndex ?? selectedPlayer, action));
  }, [game, selectedPlayer]);

  // ── AI auto-play ──
  useEffect(() => {
    if (!game || aiProcessingRef.current) return;

    // AI commitment: auto-commit for AI players during commitment phase (once per round)
    if (game.phase === 'commitment' && aiCommittedRoundRef.current !== game.round) {
      aiCommittedRoundRef.current = game.round;
      let s = game;
      let changed = false;
      for (let i = 0; i < s.players.length; i++) {
        if (isAI[i]) {
          s = aiCommit(s, i);
          changed = true;
        }
      }
      if (changed) {
        setGame(s);
      }
      return;
    }

    // AI sprint: auto-play for AI players who haven't ended their turn
    if (game.phase === 'sprint') {
      const aiPlayerToPlay = game.players.findIndex(
        (p, i) => isAI[i] && !p.turnEnded && !p.crashed,
      );
      if (aiPlayerToPlay >= 0) {
        aiProcessingRef.current = true;
        // Small delay so the human can see the AI acting
        const timer = setTimeout(() => {
          setGame(prev => {
            if (!prev) return prev;
            return aiPlaySprint(prev, aiPlayerToPlay);
          });
          aiProcessingRef.current = false;
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [game, isAI]);

  // Auto-select the first human player
  useEffect(() => {
    if (!game) return;
    const humanIndex = game.players.findIndex((_, i) => !isAI[i]);
    if (humanIndex >= 0 && isAI[selectedPlayer]) {
      setSelectedPlayer(humanIndex);
    }
  }, [game, isAI, selectedPlayer]);

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
                <div key={i} className="flex gap-2 items-center">
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
                  <button
                    onClick={() => {
                      const a = [...isAI];
                      a[i] = !a[i];
                      setIsAI(a);
                    }}
                    className={`px-3 py-2 rounded text-xs font-bold transition-colors ${
                      isAI[i]
                        ? 'bg-cyan-700 hover:bg-cyan-600 text-cyan-100 border border-cyan-500'
                        : 'bg-black/20 hover:bg-black/30 text-gray-400 border border-gray-600'
                    }`}
                  >
                    {isAI[i] ? 'AI' : 'Human'}
                  </button>
                  {playerNames.length > 1 && (
                    <button
                      onClick={() => {
                        setPlayerNames(playerNames.filter((_, j) => j !== i));
                        setIsAI(isAI.filter((_, j) => j !== i));
                      }}
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
                onClick={() => { setPlayerNames([...playerNames, `Rider ${playerNames.length + 1}`]); setIsAI([...isAI, false]); }}
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
  const hasPendingObstacle = game.activeObstacles.length > 0;

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
                  <th>Obs</th>
                  <th>Prog</th>
                  <th className="hidden sm:table-cell">Perfect</th>
                  <th>Pen</th>
                  <th>Flow</th>
                  <th>Mtm</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr key={s.name} className={s.rank === 1 ? 'text-emerald-400 font-bold' : ''}>
                    <td className="py-1">{s.rank}</td>
                    <td>{s.name}</td>
                    <td className="text-center">{s.obstaclesCleared}</td>
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

  // ── Tabletop Layout ──
  const playerCount = game.players.length;
  const topPlayers = playerCount <= 2 ? [0] : playerCount <= 4 ? [0, 1] : game.players.slice(0, Math.ceil(playerCount / 2)).map((_, i) => i);
  const bottomPlayers = playerCount <= 2 ? [1] : playerCount <= 4 ? [2, 3].filter(i => i < playerCount) : game.players.slice(Math.ceil(playerCount / 2)).map((_, i) => i + Math.ceil(playerCount / 2));

  // Get checked rows and target lanes from the active trail card
  const activeCheckedRows = game.activeTrailCard ? getTrailStageCheckedRows(game.activeTrailCard) : undefined;
  const activeTargetLanes = game.activeTrailCard ? getTrailStageTargetLanes(game.activeTrailCard) : undefined;

  return (
    <div className="h-screen game-table text-white flex flex-col overflow-hidden">
      {/* Top bar - compact info strip */}
      <div className="bg-black/50 border-b border-emerald-900/50 px-3 py-1.5 backdrop-blur-sm z-10 flex-shrink-0">
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
      <div className="flex-1 min-h-0 p-2 flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 mb-4">

          {/* TOP PLAYERS */}
          <div className="flex justify-center gap-3 flex-wrap">
            {topPlayers.map(i => {
              const player = game.players[i];
              if (!player) return null;
              const isSelected = i === selectedPlayer;
              const canSteer = isSelected && game.phase === 'sprint' && currentPlayer.actionsRemaining >= 1 && !currentPlayer.turnEnded && !currentPlayer.crashed && !hasPendingObstacle;
              return (
                <PlayerSeat key={player.id} player={player} index={i} isSelected={isSelected} canSteer={canSteer}
                  selectedSteerRow={isSelected ? selectedSteerRow : null} game={game}
                  checkedRows={activeCheckedRows} targetLanes={activeTargetLanes}
                  onSelect={() => { setSelectedPlayer(i); if (!isSelected) setSelectedSteerRow(null); }}
                  onTokenSelect={(row) => { if (canSteer) setSelectedSteerRow(prev => prev === row ? null : row); }}
                  onSteerTo={(row, dir) => { if (canSteer) { doAction({ type: 'steer', payload: { row, direction: dir } }); setSelectedSteerRow(null); } }}
                />
              );
            })}
          </div>
        </div>

        {/* ═══ MIDDLE ZONE: Table center - Trail Cards, Decks, Obstacles, Actions ═══ */}
        <div className="flex flex-wrap gap-3 mb-2">

          {/* Trail Cards */}
          <div className="flex-shrink-0">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">Trail</h3>
            <div className="flex gap-2 items-start">
              <TrailCardDisplay card={game.activeTrailCard} label="Active" compact />
              <TrailCardDisplay card={game.queuedTrailCard} label="Next" compact />
              {/* Trail deck count */}
              <div className="flex flex-col items-center gap-1">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Deck</div>
                <div
                  className="card-back deck-pile flex items-center justify-center"
                  style={{ width: '60px', height: '85px' }}
                >
                  <div className="text-white/80 text-[10px] font-bold bg-black/40 rounded px-1.5 py-0.5">
                    {game.trailDeck.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Obstacle Deck & Pending Obstacles */}
          <div className="flex-shrink-0">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">Obstacles</h3>
            <div className="flex gap-3 items-start">
              {/* Obstacle Deck (face-down draw pile) */}
              {game.phase === 'sprint' && (
                <button
                  onClick={() => doAction({ type: 'draw_obstacle' })}
                  disabled={currentPlayer.turnEnded || currentPlayer.crashed || hasPendingObstacle}
                  className="deck-pile card-back flex flex-col items-center justify-center disabled:opacity-30 transition-transform hover:scale-105"
                  style={{ width: '70px', height: '95px' }}
                >
                  <div className="text-white text-[10px] font-bold text-center drop-shadow-md bg-black/40 rounded px-1.5 py-0.5">
                    Flip
                  </div>
                  <div className="text-white/60 text-[9px] mt-0.5">
                    {game.obstacleDeck.length} left
                  </div>
                </button>
              )}

              {/* Pending obstacle to resolve */}
              {game.activeObstacles.map((obs, i) => {
                // Check exact match OR "Forced Through" wild match (2 same-symbol cards = 1 wild)
                const canMatch = (() => {
                  const mode = obs.matchMode ?? 'all';
                  const hand = currentPlayer.hand;

                  if (mode === 'any') {
                    // Exact match: any 1 matching symbol
                    if (obs.symbols.some(sym => hand.some(c => c.symbol === sym))) return true;
                    // Wild: any 2 cards of same symbol
                    const counts: Record<string, number> = {};
                    for (const c of hand) counts[c.symbol] = (counts[c.symbol] || 0) + 1;
                    return Object.values(counts).some(n => n >= 2);
                  }

                  // mode === 'all': try exact + wild matching
                  const usedIndices = new Set<number>();
                  const unmatched: string[] = [];
                  for (const sym of obs.symbols) {
                    const idx = hand.findIndex((c, ci) => c.symbol === sym && !usedIndices.has(ci));
                    if (idx >= 0) usedIndices.add(idx);
                    else unmatched.push(sym);
                  }
                  if (unmatched.length === 0) return true;
                  // Try wilds for each unmatched symbol
                  for (const _sym of unmatched) {
                    const avail: Record<string, number[]> = {};
                    for (let ci = 0; ci < hand.length; ci++) {
                      if (usedIndices.has(ci)) continue;
                      const s = hand[ci].symbol;
                      if (!avail[s]) avail[s] = [];
                      avail[s].push(ci);
                    }
                    let found = false;
                    for (const indices of Object.values(avail)) {
                      if (indices.length >= 2) {
                        usedIndices.add(indices[0]);
                        usedIndices.add(indices[1]);
                        found = true;
                        break;
                      }
                    }
                    if (!found) return false;
                  }
                  return true;
                })();

                const obsSendCost = obs.sendItCost ?? 2;
                const canSendIt = currentPlayer.momentum >= obsSendCost;

                return (
                  <div
                    key={i}
                    className="obstacle-card flex flex-col items-center justify-center"
                    style={{ width: '120px', padding: '6px' }}
                  >
                    <div className="flex gap-1 mb-1">
                      {obs.symbols.map((sym, j) => (
                        <span key={j} className="text-2xl">{SYMBOL_EMOJI[sym]}</span>
                      ))}
                    </div>
                    <div className="text-xs font-bold text-center leading-tight">{obs.name}</div>
                    <div className="text-[9px] text-red-300/70 mt-0.5 text-center">{obs.penaltyType}</div>
                    <div className="flex gap-1.5 mt-2 w-full flex-wrap">
                      {canMatch ? (
                        <button
                          onClick={() => doAction({ type: 'resolve_obstacle', payload: { obstacleIndex: i } })}
                          className="flex-1 px-2 py-1.5 rounded text-[10px] font-bold bg-emerald-700 hover:bg-emerald-600 transition-colors"
                        >
                          Match
                        </button>
                      ) : null}
                      {canSendIt ? (
                        <button
                          onClick={() => doAction({ type: 'send_it', payload: { obstacleIndex: i } })}
                          className="flex-1 px-2 py-1.5 rounded text-[10px] font-bold bg-amber-700 hover:bg-amber-600 transition-colors"
                          title="Spend 2 Momentum + 1 Hazard Die"
                        >
                          Send It (-{obsSendCost}M)
                        </button>
                      ) : null}
                      {!canMatch && !canSendIt ? (
                        <button
                          onClick={() => doAction({ type: 'send_it', payload: { obstacleIndex: i } })}
                          className="w-full px-2 py-1.5 rounded text-[10px] font-bold bg-red-800 animate-pulse"
                        >
                          CRASH
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {game.phase === 'sprint' && game.activeObstacles.length === 0 && (
                <div className="text-[10px] text-gray-500 self-center max-w-[140px] leading-tight">
                  Flip an obstacle to challenge it. Use matching cards or take the penalty.
                </div>
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

            {game.phase === 'sprint' && hasPendingObstacle && (
              <div className="text-yellow-400 text-xs font-bold mb-2 animate-pulse">
                Resolve the flipped obstacle before taking other actions!
              </div>
            )}


            {game.phase === 'sprint' && (
              <div className="space-y-3">
                {/* Core action buttons */}
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label="Pedal (+1 Mtm)"
                    onClick={() => doAction({ type: 'pedal' })}
                    disabled={hasPendingObstacle || currentPlayer.actionsRemaining < 1 || currentPlayer.cannotPedal || currentPlayer.turnEnded}
                    color="bg-blue-700 hover:bg-blue-600"
                  />
                  <ActionButton
                    label="Brake (-1 Mtm)"
                    onClick={() => doAction({ type: 'brake' })}
                    disabled={hasPendingObstacle || currentPlayer.actionsRemaining < 1 || currentPlayer.cannotBrake || currentPlayer.commitment === 'pro' || currentPlayer.turnEnded}
                    color="bg-orange-700 hover:bg-orange-600"
                  />
                  <ActionButton
                    label="End Turn"
                    onClick={() => doAction({ type: 'end_turn' })}
                    disabled={hasPendingObstacle || currentPlayer.turnEnded}
                    color="bg-gray-600 hover:bg-gray-500"
                  />
                </div>

                {/* Flow spending */}
                {currentPlayer.flow > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">Spend Flow ({currentPlayer.flow})</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <FlowButton
                        label="Ghost"
                        cost={1}
                        description="Duplicate a card symbol to help match an obstacle"
                        onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'ghost_copy' } })}
                        disabled={hasPendingObstacle || currentPlayer.flow < 1}
                      />
                      <FlowButton
                        label="Reroll"
                        cost={1}
                        description="Clear all hazard dice before the reckoning roll"
                        onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'reroll' } })}
                        disabled={hasPendingObstacle || currentPlayer.flow < 1}
                      />
                      <FlowButton
                        label="Brace"
                        cost={1}
                        description="Ignore one environmental hazard push this round"
                        onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'brace' } })}
                        disabled={hasPendingObstacle || currentPlayer.flow < 1}
                      />
                      <FlowButton
                        label="Scrub"
                        cost={3}
                        description="Ignore the speed limit — avoid speed trap penalties"
                        onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'scrub' } })}
                        disabled={hasPendingObstacle || currentPlayer.flow < 3}
                      />
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
                {game.phase === 'reckoning' && (
                  <div className="space-y-2">
                    <div>Hazard dice rolled:</div>
                    {game.lastHazardRolls.map((hr, i) => (
                      <div key={i} className="p-2 rounded bg-black/20 border border-gray-700">
                        <div className="font-bold text-xs text-gray-300 mb-1">{hr.playerName}</div>
                        {hr.rolls.length === 0 ? (
                          <div className="text-gray-600 text-xs">No hazard dice</div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex gap-1">
                              {hr.rolls.map((roll, j) => (
                                <span
                                  key={j}
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold text-sm ${
                                    roll === 6
                                      ? 'bg-red-700 text-white ring-2 ring-red-400 animate-pulse'
                                      : 'bg-gray-700 text-gray-200'
                                  }`}
                                >
                                  {roll}
                                </span>
                              ))}
                            </div>
                            {hr.penaltyDrawn && (
                              <span className="text-red-400 text-xs font-bold">
                                Penalty: {hr.penaltyDrawn}
                              </span>
                            )}
                            {!hr.penaltyDrawn && hr.rolls.length > 0 && (
                              <span className="text-green-400 text-xs">Safe!</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
            </div>

            {/* Obstacles */}
            <div className="flex flex-col items-center gap-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Obstacles</h3>
              <div className="flex gap-3 items-start">
                {game.phase === 'sprint' && (
                  <button
                    onClick={() => doAction({ type: 'draw_obstacle' })}
                    disabled={currentPlayer.turnEnded || currentPlayer.crashed || hasPendingObstacle}
                    className="deck-pile card-back flex flex-col items-center justify-center disabled:opacity-30 transition-transform hover:scale-105"
                    style={{ width: '90px', height: '125px' }}
                  >
                    <div className="text-white text-xs font-bold text-center drop-shadow-md bg-black/40 rounded px-2 py-1">Flip</div>
                    <div className="text-white/60 text-[10px] mt-1">{game.obstacleDeck.length} left</div>
                    <div className="text-white/40 text-[8px] mt-0.5 text-center">Free action</div>
                  </button>
                )}

                {game.activeObstacles.map((obs, i) => {
                  const obsSymbols = getObstacleSymbols(obs);
                  const obsMatchMode = getObstacleMatchMode(obs);
                  const canMatch = (() => {
                    const hand = currentPlayer.hand;
                    if (obsMatchMode === 'any') {
                      if (obsSymbols.some(sym => hand.some(c => getTechniqueSymbol(c) === sym))) return true;
                      const counts: Record<string, number> = {};
                      for (const c of hand) counts[getTechniqueSymbol(c)] = (counts[getTechniqueSymbol(c)] || 0) + 1;
                      return Object.values(counts).some(n => n >= 2);
                    }
                    const usedIndices = new Set<number>();
                    const unmatched: string[] = [];
                    for (const sym of obsSymbols) {
                      const idx = hand.findIndex((c, ci) => getTechniqueSymbol(c) === sym && !usedIndices.has(ci));
                      if (idx >= 0) usedIndices.add(idx);
                      else unmatched.push(sym);
                    }
                    if (unmatched.length === 0) return true;
                    for (const _sym of unmatched) {
                      const avail: Record<string, number[]> = {};
                      for (let ci = 0; ci < hand.length; ci++) {
                        if (usedIndices.has(ci)) continue;
                        const s = getTechniqueSymbol(hand[ci]);
                        if (!avail[s]) avail[s] = [];
                        avail[s].push(ci);
                      }
                      let found = false;
                      for (const indices of Object.values(avail)) {
                        if (indices.length >= 2) { usedIndices.add(indices[0]); usedIndices.add(indices[1]); found = true; break; }
                      }
                      if (!found) return false;
                    }
                    return true;
                  })();
                  const obsSendCost = getObstacleSendItCost(obs);
                  const canSendIt = currentPlayer.momentum >= obsSendCost;
                  return (
                    <div key={i} className="obstacle-card flex flex-col items-center justify-center" style={{ width: '130px', padding: '8px' }}>
                      <div className="flex gap-1 mb-1">
                        {obsSymbols.map((sym, j) => (<span key={j} className="text-2xl">{SYMBOL_EMOJI[sym]}</span>))}
                      </div>
                      <div className="text-xs font-bold text-center leading-tight">{getObstacleName(obs)}</div>
                      <div className="text-[9px] text-red-300/70 mt-0.5 text-center">{getObstaclePenaltyType(obs)}</div>
                      <div className="flex gap-1.5 mt-2 w-full flex-wrap">
                        {canMatch && (
                          <button onClick={() => doAction({ type: 'resolve_obstacle', payload: { obstacleIndex: i } })}
                            className="flex-1 px-2 py-1.5 rounded text-[10px] font-bold bg-emerald-700 text-white hover:bg-emerald-600 transition-colors">Match</button>
                        )}
                        {canSendIt && (
                          <button onClick={() => doAction({ type: 'send_it', payload: { obstacleIndex: i } })}
                            className="flex-1 px-2 py-1.5 rounded text-[10px] font-bold bg-amber-700 text-white hover:bg-amber-600 transition-colors"
                            title="Spend Momentum + 1 Hazard Die">Send It (-{obsSendCost}M)</button>
                        )}
                        {!canMatch && !canSendIt && (
                          <button onClick={() => doAction({ type: 'send_it', payload: { obstacleIndex: i } })}
                            className="w-full px-2 py-1.5 rounded text-[10px] font-bold bg-red-800 text-white animate-pulse">CRASH</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {game.phase === 'sprint' && game.activeObstacles.length === 0 && (
                  <div className="text-[10px] text-gray-400 self-center max-w-[140px] leading-tight">
                    Flip an obstacle to challenge it.
                  </div>
                )}
              </div>
            </div>

            {/* Actions panel */}
            <div className="min-w-[250px] max-w-[320px]">
              <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">
                Actions &mdash; {currentPlayer.name}
                {game.phase === 'sprint' && (
                  <span className="text-amber-600 ml-1">({currentPlayer.actionsRemaining} left)</span>
                )}
              </h3>

              {game.phase === 'setup' && (
                <p className="text-gray-500 text-sm">Game is set up. Click &quot;Next Phase&quot; to begin.</p>
              )}

              {game.phase === 'commitment' && (
                <div className="flex gap-2">
                  <button onClick={() => doAction({ type: 'commit_line', payload: { line: 'main' } })}
                    className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-300">
                    <div className="font-bold text-sm text-gray-800">Main Line</div>
                    <div className="text-[10px] text-gray-500">+1 Progress</div>
                  </button>
                  <button onClick={() => doAction({ type: 'commit_line', payload: { line: 'pro' } })}
                    className="px-4 py-2 bg-red-50 rounded-lg hover:bg-red-100 border border-red-300">
                    <div className="font-bold text-sm text-red-600">Pro Line</div>
                    <div className="text-[10px] text-gray-500">+2 Prog, No Brake</div>
                  </button>
                </div>
              )}

              {game.phase === 'sprint' && hasPendingObstacle && (
                <div className="text-amber-600 text-xs font-bold mb-2 animate-pulse">
                  Resolve the flipped obstacle before taking other actions!
                </div>
              )}

              {game.phase === 'sprint' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton label="Pedal (+1 Mtm)" onClick={() => doAction({ type: 'pedal' })}
                      disabled={hasPendingObstacle || currentPlayer.actionsRemaining < 1 || currentPlayer.cannotPedal || currentPlayer.turnEnded}
                      color="bg-blue-600 text-white hover:bg-blue-500" />
                    <ActionButton label="Brake (-1 Mtm)" onClick={() => doAction({ type: 'brake' })}
                      disabled={hasPendingObstacle || currentPlayer.actionsRemaining < 1 || currentPlayer.cannotBrake || currentPlayer.commitment === 'pro' || currentPlayer.turnEnded}
                      color="bg-orange-600 text-white hover:bg-orange-500" />
                    <ActionButton label="End Turn" onClick={() => doAction({ type: 'end_turn' })}
                      disabled={hasPendingObstacle || currentPlayer.turnEnded}
                      color="bg-gray-500 text-white hover:bg-gray-400" />
                  </div>
                  {currentPlayer.flow > 0 && (
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1">Spend Flow ({currentPlayer.flow})</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <FlowButton label="Ghost" cost={1} description="Duplicate a card symbol to help match an obstacle"
                          onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'ghost_copy' } })} disabled={hasPendingObstacle || currentPlayer.flow < 1} />
                        <FlowButton label="Reroll" cost={1} description="Clear all hazard dice before the reckoning roll"
                          onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'reroll' } })} disabled={hasPendingObstacle || currentPlayer.flow < 1} />
                        <FlowButton label="Brace" cost={1} description="Ignore one environmental hazard push this round"
                          onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'brace' } })} disabled={hasPendingObstacle || currentPlayer.flow < 1} />
                        <FlowButton label="Scrub" cost={3} description="Ignore the speed limit"
                          onClick={() => doAction({ type: 'flow_spend', payload: { flowAction: 'scrub' } })} disabled={hasPendingObstacle || currentPlayer.flow < 3} />
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
                  {game.phase === 'reckoning' && (
                    <div className="space-y-2">
                      <div>Hazard dice rolled:</div>
                      {game.lastHazardRolls.map((hr, i) => (
                        <div key={i} className="p-2 rounded bg-gray-50 border border-gray-200">
                          <div className="font-bold text-xs text-gray-700 mb-1">{hr.playerName}</div>
                          {hr.rolls.length === 0 ? (
                            <div className="text-gray-400 text-xs">No hazard dice</div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex gap-1">
                                {hr.rolls.map((roll, j) => (
                                  <span key={j} className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold text-sm ${
                                    roll === 6 ? 'bg-red-600 text-white ring-2 ring-red-400 animate-pulse' : 'bg-gray-200 text-gray-700'
                                  }`}>{roll}</span>
                                ))}
                              </div>
                              {hr.penaltyDrawn && <span className="text-red-500 text-xs font-bold">Penalty: {hr.penaltyDrawn}</span>}
                              {!hr.penaltyDrawn && hr.rolls.length > 0 && <span className="text-emerald-600 text-xs">Safe!</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {game.phase === 'stage_break' && (
                <div className="trail-card p-3">
                  <h3 className="text-xs font-bold mb-2">Upgrade Shop</h3>
                  {game.players.map((player, pi) => (
                    <div key={player.id} className="mb-3">
                      <div className="text-[10px] text-gray-500 mb-1">{player.name} — Flow: {player.flow}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ALL_UPGRADE_TYPES.map(upgrade => {
                          const props = UPGRADE_PROPERTIES[upgrade];
                          const owned = player.upgrades.includes(upgrade);
                          const canAfford = player.flow >= props.flowCost;
                          return (
                            <button key={upgrade}
                              onClick={() => doAction({ type: 'buy_upgrade', payload: { upgrade } }, pi)}
                              disabled={owned || !canAfford}
                              className={`text-left p-1.5 text-[10px] transition-colors ${
                                owned ? 'upgrade-card opacity-60' : canAfford ? 'upgrade-card' : 'upgrade-card opacity-40'
                              }`}>
                              <div className="font-bold">{props.name} <span className="text-amber-500">({props.flowCost}F)</span></div>
                              <div className="text-gray-400">{props.description}</div>
                              {owned && <div className="text-emerald-500 text-[9px]">Owned</div>}
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

          {/* BOTTOM PLAYERS */}
          <div className="flex justify-center gap-3 flex-wrap">
            {bottomPlayers.map(i => {
              const player = game.players[i];
              if (!player) return null;
              const isSelected = i === selectedPlayer;
              const canSteer = isSelected && game.phase === 'sprint' && currentPlayer.actionsRemaining >= 1 && !currentPlayer.turnEnded && !currentPlayer.crashed && !hasPendingObstacle;
              return (
                <PlayerSeat key={player.id} player={player} index={i} isSelected={isSelected} canSteer={canSteer}
                  selectedSteerRow={isSelected ? selectedSteerRow : null} game={game}
                  checkedRows={activeCheckedRows} targetLanes={activeTargetLanes}
                  onSelect={() => { setSelectedPlayer(i); if (!isSelected) setSelectedSteerRow(null); }}
                  onTokenSelect={(row) => { if (canSteer) setSelectedSteerRow(prev => prev === row ? null : row); }}
                  onSteerTo={(row, dir) => { if (canSteer) { doAction({ type: 'steer', payload: { row, direction: dir } }); setSelectedSteerRow(null); } }}
                />
              );
            })}
          </div>
        </div>

        {/* Effect Toast */}
        {effectToast && (
          <div
            className="animate-pulse rounded-lg px-4 py-3 mb-2 border-2 flex items-center gap-3"
            style={{
              borderColor: effectToast.color,
              backgroundColor: `${effectToast.color}15`,
              boxShadow: `0 0 20px ${effectToast.color}30`,
            }}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: effectToast.color, boxShadow: `0 0 8px ${effectToast.color}` }}
            />
            <div>
              <span className="font-bold text-sm" style={{ color: effectToast.color }}>{effectToast.cardName}</span>
              <span className="text-gray-300 text-sm ml-2">{effectToast.text}</span>
            </div>
          </div>
        )}

        {/* BOTTOM ZONE: Hand + Penalties + Game Log */}
        <div className="flex flex-wrap gap-3 flex-shrink-0">
          {/* Player's Hand */}
          <div className="flex-1 min-w-[250px]">
            <h3 className="text-xs font-bold mb-2 text-gray-400 uppercase tracking-wider">
              {currentPlayer.name}&apos;s Hand
              {game.phase === 'sprint' && <span className="text-gray-600 normal-case"> (Click to play = 1 Action)</span>}
            </h3>
            <HandDisplay
              hand={currentPlayer.hand}
              onPlay={game.phase === 'sprint' ? (i) => doAction({ type: 'technique', payload: { cardIndex: i } }) : undefined}
              disabled={game.phase !== 'sprint' || currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
              activeObstacles={game.activeObstacles}
            />
          </div>

          {/* Penalties - shown for all players who have any */}
          {game.players.some(p => p.penalties.length > 0) && (
            <div className="min-w-[180px]">
              <h3 className="text-xs font-bold mb-2 text-orange-400 uppercase tracking-wider">Penalty Cards</h3>
              {game.players.map(player => {
                if (player.penalties.length === 0) return null;
                return (
                  <div key={player.id} className="mb-2">
                    <div className="text-[10px] text-gray-400 font-bold mb-1">{player.name} ({player.penalties.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {player.penalties.map((pen, i) => (
                        <div
                          key={i}
                          className="rounded-lg px-2.5 py-2 text-xs"
                          style={{
                            background: 'linear-gradient(135deg, #4a1a0a 0%, #2a0a00 100%)',
                            border: '2px solid #8b4513',
                            boxShadow: '0 2px 6px rgba(139,69,19,0.4), inset 0 1px 0 rgba(255,200,100,0.1)',
                          }}
                        >
                          <div className="font-bold text-orange-300">{getPenaltyName(pen)}</div>
                          <div className="text-orange-200/60 text-[10px] mt-0.5">{getPenaltyDescription(pen)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Game Log */}
          <div className="min-w-[180px] w-full sm:w-auto sm:max-w-[280px]">
            <h3 className="text-xs font-bold mb-1 text-gray-400 uppercase tracking-wider">Game Log</h3>
            <div className="h-28">
              <GameLog log={game.log} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerSeat({
  player, index, isSelected, canSteer, selectedSteerRow, game,
  checkedRows, targetLanes,
  onSelect, onTokenSelect, onSteerTo,
}: {
  player: PlayerState;
  index: number;
  isSelected: boolean;
  canSteer: boolean;
  selectedSteerRow: number | null;
  game: GameState;
  checkedRows?: number[];
  targetLanes?: number[];
  onSelect: () => void;
  onTokenSelect: (row: number) => void;
  onSteerTo: (row: number, direction: number) => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl p-3 transition-all border-2 ${
        isSelected
          ? 'border-emerald-500 bg-emerald-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
      style={{ minWidth: '180px' }}
    >
      <GameBoard
        player={player}
        checkedRows={checkedRows}
        targetLanes={targetLanes}
        compact
        steerEnabled={canSteer}
        selectedSteerRow={selectedSteerRow}
        onTokenSelect={onTokenSelect}
        onSteerTo={onSteerTo}
      />
      {/* Mini stats under each board */}
      <div className="grid grid-cols-4 gap-1 mt-2 text-center text-[10px]">
        <div><span className="text-emerald-600 font-bold">{player.progress}</span> <span className="text-gray-400">Prog</span></div>
        <div><span className="text-blue-600 font-bold">{player.momentum}</span> <span className="text-gray-400">Mtm</span></div>
        <div><span className="text-purple-600 font-bold">{player.flow}</span> <span className="text-gray-400">Flow</span></div>
        <div><span className="text-red-500 font-bold">{player.hazardDice}</span> <span className="text-gray-400">Haz</span></div>
      </div>
      {/* Line commitment indicator */}
      {player.commitment && (
        <div className={`text-center text-[9px] mt-1 font-bold ${player.commitment === 'pro' ? 'text-red-500' : 'text-gray-400'}`}>
          {player.commitment === 'pro' ? 'PRO LINE' : 'Main Line'}
        </div>
      )}
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

function FlowButton({
  label,
  cost,
  description,
  onClick,
  disabled,
}: {
  label: string;
  cost: number;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left p-2 rounded-lg bg-purple-900/60 hover:bg-purple-800/70 border border-purple-600/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-bold text-xs text-purple-200">{label}</span>
        <span className="text-[10px] font-mono text-purple-400">{cost}F</span>
      </div>
      <div className="text-[9px] text-purple-300/60 leading-tight">{description}</div>
    </button>
  );
}
