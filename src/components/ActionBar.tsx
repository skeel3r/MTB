'use client';

import { GameState, GameAction, PlayerState } from '@/lib/types';

export default function ActionBar({
  game,
  currentPlayer,
  hasPendingObstacle,
  onAction,
}: {
  game: GameState;
  currentPlayer: PlayerState;
  hasPendingObstacle: boolean;
  onAction: (action: GameAction) => void;
}) {
  if (game.phase !== 'sprint') return null;

  const disabled = currentPlayer.turnEnded || currentPlayer.crashed;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Pending obstacle warning */}
      {hasPendingObstacle && (
        <div className="text-[10px] font-bold animate-pulse mr-2" style={{ color: '#D4A847' }}>
          Resolve obstacle first!
        </div>
      )}

      {/* Core sprint actions */}
      <button
        onClick={() => onAction({ type: 'pedal' })}
        disabled={hasPendingObstacle || currentPlayer.actionsRemaining < 1 || currentPlayer.cannotPedal || disabled}
        className="wpa-btn px-3 py-1 rounded text-[11px] text-white disabled:opacity-30"
        style={{ background: '#1B2A4A', border: '1px solid #2E6B62' }}
      >
        Pedal (+1M)
      </button>
      <button
        onClick={() => onAction({ type: 'brake' })}
        disabled={hasPendingObstacle || currentPlayer.actionsRemaining < 1 || currentPlayer.cannotBrake || currentPlayer.commitment === 'pro' || disabled}
        className="wpa-btn px-3 py-1 rounded text-[11px] text-white disabled:opacity-30"
        style={{ background: '#C35831', border: '1px solid #9A3A1A' }}
      >
        Brake (-1M)
      </button>
      <button
        onClick={() => onAction({ type: 'end_turn' })}
        disabled={hasPendingObstacle || disabled}
        className="wpa-btn px-3 py-1 rounded text-[11px] text-white disabled:opacity-30"
        style={{ background: '#5C3D2E', border: '1px solid #8B5E3C' }}
      >
        End Turn
      </button>

      {/* Actions remaining badge */}
      <span className="text-[10px] font-mono font-bold ml-1" style={{ color: '#D4A847' }}>
        {currentPlayer.actionsRemaining} actions
      </span>

      {/* Flow spending */}
      {currentPlayer.flow > 0 && (
        <>
          <div className="w-px h-5 mx-1" style={{ background: 'rgba(212,168,71,0.3)' }} />
          <span className="text-[10px] font-bold" style={{ color: '#B898D0' }}>Flow {currentPlayer.flow}:</span>
          {[
            { label: 'Ghost', cost: 1, action: 'ghost_copy' },
            { label: 'Reroll', cost: 1, action: 'reroll' },
            { label: 'Brace', cost: 1, action: 'brace' },
            { label: 'Scrub', cost: 3, action: 'scrub' },
          ].map((f) => (
            <button
              key={f.action}
              onClick={() => onAction({ type: 'flow_spend', payload: { flowAction: f.action } })}
              disabled={hasPendingObstacle || currentPlayer.flow < f.cost || disabled}
              className="px-2 py-0.5 rounded text-[10px] font-bold disabled:opacity-30 text-white"
              style={{ background: 'rgba(46,107,98,0.5)', border: '1px solid rgba(74,154,142,0.4)' }}
              title={`${f.label} (${f.cost}F)`}
            >
              {f.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
