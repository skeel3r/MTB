'use client';

import { GameState, GameAction, PlayerState } from '@/lib/types';
import {
  SYMBOL_EMOJI,
  getObstacleSymbols, getObstacleName, getObstaclePenaltyType, getObstacleSendItCost,
} from '@/lib/cards';
import { canMatchObstacle } from '@/lib/obstacle-utils';

export default function ObstacleZone({
  game,
  currentPlayer,
  onAction,
}: {
  game: GameState;
  currentPlayer: PlayerState;
  onAction: (action: GameAction) => void;
}) {
  const hasPending = game.activeObstacles.length > 0;
  const isSprint = game.phase === 'sprint';

  return (
    <div className="flex items-start gap-3">
      {/* Draw pile */}
      {isSprint && (
        <button
          onClick={() => onAction({ type: 'draw_obstacle' })}
          disabled={currentPlayer.turnEnded || currentPlayer.crashed || hasPending}
          className="deck-pile card-back flex flex-col items-center justify-center disabled:opacity-30 transition-transform hover:scale-105 flex-shrink-0"
          style={{ width: '80px', height: '110px' }}
        >
          <div className="text-white text-[10px] font-bold text-center drop-shadow-md bg-black/40 rounded px-1.5 py-0.5">
            Flip
          </div>
          <div className="text-white/60 text-[9px] mt-0.5">{game.obstacleDeck.length} left</div>
          <div className="text-white/40 text-[7px] mt-0.5">Free action</div>
        </button>
      )}

      {/* Active obstacles */}
      {game.activeObstacles.map((obs, i) => {
        const matched = canMatchObstacle(currentPlayer.hand, obs);
        const sendCost = getObstacleSendItCost(obs);
        const canSend = currentPlayer.momentum >= sendCost;

        return (
          <div
            key={i}
            className="obstacle-card flex flex-col items-center justify-center flex-shrink-0"
            style={{ width: '120px', padding: '8px' }}
          >
            <div className="flex gap-1 mb-0.5">
              {getObstacleSymbols(obs).map((sym, j) => (
                <span key={j} className="text-xl">{SYMBOL_EMOJI[sym]}</span>
              ))}
            </div>
            <div className="text-[10px] font-bold text-center leading-tight">{getObstacleName(obs)}</div>
            <div className="text-[8px] text-red-300/70 text-center mt-0.5">{getObstaclePenaltyType(obs)}</div>
            <div className="flex gap-1.5 mt-1.5 w-full flex-wrap">
              {matched && (
                <button
                  onClick={() => onAction({ type: 'resolve_obstacle', payload: { obstacleIndex: i } })}
                  className="flex-1 px-2 py-1 rounded text-[10px] font-bold text-white"
                  style={{ background: '#3A6B35' }}
                >
                  Match
                </button>
              )}
              {canSend && (
                <button
                  onClick={() => onAction({ type: 'send_it', payload: { obstacleIndex: i } })}
                  className="flex-1 px-2 py-1 rounded text-[10px] font-bold text-white"
                  style={{ background: '#B8922E' }}
                  title={`Spend ${sendCost} Momentum + 1 Hazard Die`}
                >
                  Send It (-{sendCost}M)
                </button>
              )}
              {!matched && !canSend && (
                <button
                  onClick={() => onAction({ type: 'send_it', payload: { obstacleIndex: i } })}
                  className="w-full px-2 py-1 rounded text-[10px] font-bold text-white animate-pulse"
                  style={{ background: '#9A3A1A' }}
                >
                  CRASH
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Empty state hint */}
      {isSprint && game.activeObstacles.length === 0 && (
        <div className="text-[10px] self-center max-w-[120px] leading-tight" style={{ color: '#A08A6A' }}>
          Flip an obstacle to challenge it.
        </div>
      )}
    </div>
  );
}
