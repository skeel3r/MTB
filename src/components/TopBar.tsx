'use client';

import { GameState } from '@/lib/types';

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

export default function TopBar({
  game,
  onAdvance,
}: {
  game: GameState;
  onAdvance: () => void;
}) {
  const allDone = game.phase === 'sprint' && game.players.every(p => p.turnEnded || p.crashed);
  const showAdvance =
    (game.phase !== 'sprint' && game.phase !== 'game_over') || allDone;

  return (
    <div
      className="game-shell-top px-4 py-1.5 flex items-center justify-between"
      style={{
        background: 'rgba(13,27,42,0.85)',
        borderBottom: '2px solid #D4A847',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div className="flex items-center gap-4">
        <h1 className="wpa-heading text-lg font-bold" style={{ color: '#D4A847' }}>
          Treadline
        </h1>
        <span className="text-xs" style={{ color: '#A08A6A' }}>
          Round {game.round}/{game.trailLength} &middot; {PHASE_LABELS[game.phase] ?? game.phase}
        </span>
      </div>

      {showAdvance && (
        <button
          onClick={onAdvance}
          className="wpa-btn wpa-btn-primary px-4 py-1.5 rounded text-xs"
        >
          {allDone ? 'All Done' : 'Next Phase'} &rarr;
        </button>
      )}
    </div>
  );
}
