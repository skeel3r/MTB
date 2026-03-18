'use client';

import { GameState } from '@/lib/types';
import GameLog from '@/components/GameLog';

export default function InfoPanel({ game }: { game: GameState }) {
  return (
    <div
      className="game-shell-right flex flex-col overflow-hidden p-2"
      style={{
        background: 'linear-gradient(180deg, rgba(13,27,42,0.6) 0%, rgba(13,27,42,0.4) 100%)',
        borderLeft: '1px solid rgba(212,168,71,0.2)',
      }}
    >
      <h3 className="text-[10px] font-bold uppercase tracking-wider mb-1 flex-shrink-0" style={{ color: '#A08A6A' }}>
        Game Log
      </h3>
      <div className="flex-1 min-h-0">
        <GameLog log={game.log} />
      </div>
    </div>
  );
}
