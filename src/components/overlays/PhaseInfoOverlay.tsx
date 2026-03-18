'use client';

import { GameState } from '@/lib/types';

const PHASE_DESCRIPTIONS: Record<string, string> = {
  setup: 'Game is set up. Advance to begin.',
  scroll_descent: 'Tokens shifted down. New trail section revealed.',
  environment: 'Environmental hazards applied to the trail.',
  preparation: 'Cards drawn based on momentum.',
  alignment: 'Grid checked against trail card targets.',
};

export default function PhaseInfoOverlay({ game }: { game: GameState }) {
  const desc = PHASE_DESCRIPTIONS[game.phase] ?? '';

  return (
    <div className="trail-card p-5 max-w-xs text-center">
      <h2 className="wpa-heading text-lg font-bold mb-2" style={{ color: '#D4A847' }}>
        {game.phase === 'setup' ? 'Ready to Ride' : game.phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
      </h2>
      <p className="text-sm mb-1" style={{ color: '#E8D5B7' }}>{desc}</p>
      {game.phase === 'environment' && (
        <p className="text-xs" style={{ color: '#A08A6A' }}>
          {game.currentHazards.length} hazard{game.currentHazards.length !== 1 ? 's' : ''} applied.
        </p>
      )}
      <p className="text-[10px] mt-3" style={{ color: '#A08A6A' }}>
        Click &ldquo;Next Phase&rdquo; to continue.
      </p>
    </div>
  );
}
