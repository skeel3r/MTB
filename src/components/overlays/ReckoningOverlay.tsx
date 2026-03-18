'use client';

import { GameState } from '@/lib/types';

export default function ReckoningOverlay({ game }: { game: GameState }) {
  return (
    <div className="trail-card p-5 max-w-md w-full">
      <h2 className="wpa-heading text-lg font-bold mb-3 text-center" style={{ color: '#D4A847' }}>
        The Reckoning
      </h2>
      <div className="space-y-2">
        {game.lastHazardRolls.map((hr, i) => (
          <div key={i} className="p-2 rounded bg-black/20 border border-gray-700">
            <div className="font-bold text-xs mb-1" style={{ color: '#E8D5B7' }}>
              {hr.playerName}
            </div>
            {hr.rolls.length === 0 ? (
              <div className="text-[10px]" style={{ color: '#A08A6A' }}>No hazard dice</div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  {hr.rolls.map((roll, j) => (
                    <span
                      key={j}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs ${
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
                  <span className="text-red-400 text-[10px] font-bold">
                    Penalty: {hr.penaltyDrawn}
                  </span>
                )}
                {!hr.penaltyDrawn && hr.rolls.length > 0 && (
                  <span className="text-[10px]" style={{ color: '#7BC47F' }}>Safe!</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
