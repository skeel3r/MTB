'use client';

import { GameAction, PlayerState } from '@/lib/types';

export default function CommitmentOverlay({
  currentPlayer,
  onAction,
}: {
  currentPlayer: PlayerState;
  onAction: (action: GameAction) => void;
}) {
  const committed = currentPlayer.commitment;
  const hasChosen = committed === 'main' || committed === 'pro';

  return (
    <div className="trail-card p-6 max-w-sm text-center">
      <h2 className="wpa-heading text-lg font-bold mb-1" style={{ color: '#D4A847' }}>
        Choose Your Line
      </h2>
      <p className="text-[11px] mb-4" style={{ color: '#A08A6A' }}>
        {hasChosen
          ? `${currentPlayer.name} committed to ${committed === 'pro' ? 'Pro' : 'Main'} Line`
          : `${currentPlayer.name}, pick your commitment for this round.`}
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => onAction({ type: 'commit_line', payload: { line: 'main' } })}
          className="px-5 py-3 rounded-lg border-2 transition-all hover:brightness-110"
          style={
            committed === 'main'
              ? { background: 'rgba(58,107,53,0.4)', borderColor: '#D4A847', boxShadow: '0 0 12px rgba(212,168,71,0.3)' }
              : { background: 'rgba(27,42,74,0.5)', borderColor: '#8B5E3C' }
          }
        >
          <div className="font-bold text-sm" style={{ color: '#F2E8CF' }}>Main Line</div>
          <div className="text-[10px]" style={{ color: '#A08A6A' }}>+1 Progress</div>
          {committed === 'main' && (
            <div className="text-[9px] font-bold mt-1" style={{ color: '#D4A847' }}>SELECTED</div>
          )}
        </button>
        <button
          onClick={() => onAction({ type: 'commit_line', payload: { line: 'pro' } })}
          className="px-5 py-3 rounded-lg border-2 transition-all hover:brightness-110"
          style={
            committed === 'pro'
              ? { background: 'rgba(195,88,49,0.4)', borderColor: '#D4A847', boxShadow: '0 0 12px rgba(212,168,71,0.3)' }
              : { background: 'rgba(154,58,26,0.3)', borderColor: '#C35831' }
          }
        >
          <div className="font-bold text-sm" style={{ color: '#E07070' }}>Pro Line</div>
          <div className="text-[10px]" style={{ color: '#A08A6A' }}>+2 Prog, No Brake</div>
          {committed === 'pro' && (
            <div className="text-[9px] font-bold mt-1" style={{ color: '#D4A847' }}>SELECTED</div>
          )}
        </button>
      </div>
    </div>
  );
}
