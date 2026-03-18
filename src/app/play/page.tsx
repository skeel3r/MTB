'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, GameAction } from '@/lib/types';
import { initGame, advancePhase, processAction, getStandings } from '@/lib/engine';
import {
  SYMBOL_COLORS,
  getTechniqueSymbol, getTechniqueName, getTechniqueActionText,
} from '@/lib/cards';
import { aiPlaySprint, aiCommit } from '@/lib/ai-player';
import GameLog from '@/components/GameLog';
import GameShell from '@/components/GameShell';

// ── Setup Screen ──
function SetupScreen({
  onStart,
}: {
  onStart: (names: string[], ai: boolean[]) => void;
}) {
  const [playerNames, setPlayerNames] = useState(['Rider 1', 'Rider 2']);
  const [isAI, setIsAI] = useState([false, true]);

  return (
    <div className="min-h-screen game-table text-white p-4 sm:p-8">
      <div className="max-w-lg mx-auto">
        <h1 className="wpa-heading text-2xl sm:text-3xl font-bold mb-2" style={{ color: '#D4A847' }}>
          Treadline
        </h1>
        <p className="mb-6" style={{ color: 'rgba(184,200,168,0.6)' }}>Set up your game</p>

        <div className="trail-card p-6 mb-6">
          <div className="space-y-3 mb-6">
            {playerNames.map((name, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={name}
                  onChange={(e) => {
                    const n = [...playerNames];
                    n[i] = e.target.value;
                    setPlayerNames(n);
                  }}
                  className="flex-1 bg-black/30 border rounded px-3 py-2 text-white"
                  style={{ borderColor: '#3A6B35' }}
                  placeholder={`Player ${i + 1}`}
                />
                <button
                  onClick={() => {
                    const a = [...isAI];
                    a[i] = !a[i];
                    setIsAI(a);
                  }}
                  className={`px-3 py-2 rounded text-xs font-bold transition-colors border ${
                    isAI[i] ? 'text-white' : 'bg-black/20 hover:bg-black/30 text-gray-400'
                  }`}
                  style={isAI[i] ? { background: '#2E6B62', borderColor: '#4A9A8E' } : { borderColor: '#3A6B35' }}
                >
                  {isAI[i] ? 'AI' : 'Human'}
                </button>
                {playerNames.length > 1 && (
                  <button
                    onClick={() => {
                      setPlayerNames(playerNames.filter((_, j) => j !== i));
                      setIsAI(isAI.filter((_, j) => j !== i));
                    }}
                    className="px-3 py-2 rounded hover:opacity-80"
                    style={{ background: '#9A3A1A' }}
                  >
                    X
                  </button>
                )}
              </div>
            ))}
          </div>

          {playerNames.length < 6 && (
            <button
              onClick={() => {
                setPlayerNames([...playerNames, `Rider ${playerNames.length + 1}`]);
                setIsAI([...isAI, false]);
              }}
              className="w-full py-2 mb-4 bg-black/20 rounded hover:bg-black/30 border"
              style={{ borderColor: '#3A6B35', color: '#B8C8A8' }}
            >
              + Add Player
            </button>
          )}
        </div>

        <button
          onClick={() => {
            const names = playerNames.filter((n) => n.trim());
            if (names.length >= 1) onStart(names, isAI.slice(0, names.length));
          }}
          className="wpa-btn wpa-btn-primary w-full py-3 rounded-lg text-lg"
        >
          Start Game
        </button>
      </div>
    </div>
  );
}

// ── Game Over Screen ──
function GameOverScreen({
  game,
  onNewGame,
}: {
  game: GameState;
  onNewGame: () => void;
}) {
  const standings = getStandings(game);

  return (
    <div className="min-h-screen game-table text-white p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="wpa-heading text-3xl sm:text-4xl font-bold mb-2 text-center" style={{ color: '#D4A847' }}>
          Game Over!
        </h1>
        <p className="text-center text-lg sm:text-xl mb-6 sm:mb-8" style={{ color: '#7BC47F' }}>
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
              {standings.map((s) => (
                <tr
                  key={s.name}
                  className={s.rank === 1 ? 'font-bold' : ''}
                  style={s.rank === 1 ? { color: '#D4A847' } : {}}
                >
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

        <div className="h-40">
          <GameLog log={game.log} />
        </div>

        <button
          onClick={onNewGame}
          className="wpa-btn wpa-btn-primary mt-4 w-full py-3 rounded-lg"
        >
          New Game
        </button>
      </div>
    </div>
  );
}

// ── Main Page Orchestrator ──
export default function PlayPage() {
  const [game, setGame] = useState<GameState | null>(null);
  const [isAI, setIsAI] = useState<boolean[]>([false, true]);
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [selectedSteerRow, setSelectedSteerRow] = useState<number | null>(null);
  const [effectToast, setEffectToast] = useState<{ cardName: string; text: string; color: string } | null>(null);
  const aiProcessingRef = useRef(false);
  const aiCommittedRoundRef = useRef(-1);

  // ── Start game ──
  const handleStart = useCallback((names: string[], ai: boolean[]) => {
    setIsAI(ai);
    setGame(initGame(names));
  }, []);

  // ── Advance phase ──
  const doAdvance = useCallback(() => {
    if (!game) return;
    setSelectedSteerRow(null);
    setGame(advancePhase(game));
  }, [game]);

  // ── Process action ──
  const doAction = useCallback(
    (action: GameAction, playerIndex?: number) => {
      if (!game) return;

      // Technique card toast
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
    },
    [game, selectedPlayer],
  );

  // ── AI auto-play ──
  useEffect(() => {
    if (!game || aiProcessingRef.current) return;

    // AI commitment
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
      if (changed) setGame(s);
      return;
    }

    // AI sprint
    if (game.phase === 'sprint') {
      const aiIdx = game.players.findIndex((p, i) => isAI[i] && !p.turnEnded && !p.crashed);
      if (aiIdx >= 0) {
        aiProcessingRef.current = true;
        const timer = setTimeout(() => {
          setGame((prev) => {
            if (!prev) return prev;
            return aiPlaySprint(prev, aiIdx);
          });
          aiProcessingRef.current = false;
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [game, isAI]);

  // Auto-select first human player
  useEffect(() => {
    if (!game) return;
    const humanIndex = game.players.findIndex((_, i) => !isAI[i]);
    if (humanIndex >= 0 && isAI[selectedPlayer]) {
      setSelectedPlayer(humanIndex);
    }
  }, [game, isAI, selectedPlayer]);

  // ── Steer handlers ──
  const handleTokenSelect = useCallback(
    (row: number) => {
      setSelectedSteerRow((prev) => (prev === row ? null : row));
    },
    [],
  );

  const handleSteerTo = useCallback(
    (row: number, direction: number) => {
      doAction({ type: 'steer', payload: { row, direction } });
      setSelectedSteerRow(null);
    },
    [doAction],
  );

  const handleSelectPlayer = useCallback(
    (index: number) => {
      setSelectedPlayer(index);
      setSelectedSteerRow(null);
    },
    [],
  );

  // ── Routing ──
  if (!game) {
    return <SetupScreen onStart={handleStart} />;
  }

  if (game.phase === 'game_over') {
    return <GameOverScreen game={game} onNewGame={() => setGame(null)} />;
  }

  return (
    <GameShell
      game={game}
      selectedPlayer={selectedPlayer}
      selectedSteerRow={selectedSteerRow}
      isAI={isAI}
      effectToast={effectToast}
      onAdvance={doAdvance}
      onAction={doAction}
      onSelectPlayer={handleSelectPlayer}
      onTokenSelect={handleTokenSelect}
      onSteerTo={handleSteerTo}
    />
  );
}
