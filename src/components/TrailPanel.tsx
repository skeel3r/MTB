'use client';

import { GameState } from '@/lib/types';
import { getStandings } from '@/lib/engine';
import { TrailCardDisplay } from '@/components/GameBoard';

export default function TrailPanel({ game, inline, selectedPlayer }: { game: GameState; inline?: boolean; selectedPlayer?: number }) {
  const standings = getStandings(game);
  // Muddy Goggles: hide queued trail card for the current player
  const currentPlayer = selectedPlayer != null ? game.players[selectedPlayer] : null;
  const hideQueued = currentPlayer?.penalties.includes('muddy_goggles') ?? false;

  if (inline) {
    // Compact horizontal layout for mobile
    return (
      <div className="flex items-center gap-3 p-2 overflow-x-auto" style={{ borderBottom: '1px solid rgba(212,168,71,0.15)' }}>
        <div className="flex gap-1.5 flex-shrink-0">
          <TrailCardDisplay card={game.activeTrailCard} label="Active" compact />
          <TrailCardDisplay card={game.queuedTrailCard} label="Next" compact faceDown={hideQueued} />
        </div>
        <div className="card-back deck-pile flex items-center justify-center flex-shrink-0" style={{ width: '40px', height: '56px' }}>
          <div className="text-white/80 text-[8px] font-bold bg-black/40 rounded px-1">{game.trailDeck.length}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px]">
            {standings.map((s) => (
              <span key={s.name} style={{ color: s.rank === 1 ? '#D4A847' : '#A08A6A' }}>
                {s.rank}. {s.name} <span className="font-mono" style={{ color: '#7BC47F' }}>{s.progress}p</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="game-shell-left flex flex-col gap-2 p-2 overflow-y-auto"
      style={{
        background: 'linear-gradient(180deg, rgba(13,27,42,0.6) 0%, rgba(13,27,42,0.4) 100%)',
        borderRight: '1px solid rgba(212,168,71,0.2)',
      }}
    >
      {/* Trail Cards */}
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#A08A6A' }}>
          Trail
        </h3>
        <div className="flex gap-1.5 justify-center">
          <TrailCardDisplay card={game.activeTrailCard} label="Active" compact />
          <TrailCardDisplay card={game.queuedTrailCard} label="Next" compact faceDown={hideQueued} />
        </div>
      </div>

      {/* Trail Deck */}
      <div className="flex justify-center">
        <div
          className="card-back deck-pile flex items-center justify-center"
          style={{ width: '50px', height: '70px' }}
        >
          <div className="text-white/80 text-[9px] font-bold bg-black/40 rounded px-1 py-0.5">
            {game.trailDeck.length}
          </div>
        </div>
      </div>

      {/* Standings */}
      <div className="mt-auto">
        <h3 className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#A08A6A' }}>
          Standings
        </h3>
        <div className="space-y-0.5">
          {standings.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: s.rank === 1 ? 'rgba(212,168,71,0.12)' : 'transparent',
              }}
            >
              <span style={{ color: s.rank === 1 ? '#D4A847' : '#A08A6A' }}>
                {s.rank}. {s.name}
              </span>
              <span className="font-mono font-bold" style={{ color: '#7BC47F' }}>
                {s.obstaclesCleared}obs {s.progress}p
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
