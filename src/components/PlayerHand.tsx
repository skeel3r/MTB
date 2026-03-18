'use client';

import { GameState, GameAction, PlayerState } from '@/lib/types';
import { getPenaltyName, getPenaltyDescription } from '@/lib/cards';
import { HandDisplay } from '@/components/GameBoard';

export default function PlayerHand({
  game,
  currentPlayer,
  onAction,
}: {
  game: GameState;
  currentPlayer: PlayerState;
  onAction: (action: GameAction) => void;
}) {
  const isSprint = game.phase === 'sprint';

  return (
    <div
      className="game-shell-bottom flex items-start gap-3 px-3 py-2 overflow-x-auto"
      style={{
        background: 'rgba(13,27,42,0.85)',
        borderTop: '1px solid rgba(212,168,71,0.2)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Hand */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#A08A6A' }}>
          {currentPlayer.name}&apos;s Hand
          {isSprint && <span className="text-gray-600 normal-case ml-1">(Click to play = 1 Action)</span>}
        </div>
        <HandDisplay
          hand={currentPlayer.hand}
          onPlay={
            isSprint
              ? (i) => onAction({ type: 'technique', payload: { cardIndex: i } })
              : undefined
          }
          disabled={!isSprint || currentPlayer.actionsRemaining < 1 || currentPlayer.turnEnded}
          activeObstacles={game.activeObstacles}
        />
      </div>

      {/* Penalties */}
      {currentPlayer.penalties.length > 0 && (
        <div className="flex-shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#E0875C' }}>
            Penalties ({currentPlayer.penalties.length})
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {currentPlayer.penalties.map((pen, i) => (
              <div key={i} className="penalty-card rounded px-2 py-1.5 text-[10px]">
                <div className="font-bold" style={{ color: '#D4A847' }}>{getPenaltyName(pen)}</div>
                <div className="text-[9px]" style={{ color: 'rgba(240,216,128,0.6)' }}>
                  {getPenaltyDescription(pen)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
