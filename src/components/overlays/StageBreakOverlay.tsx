'use client';

import { GameState, GameAction } from '@/lib/types';
import { ALL_UPGRADE_TYPES, UPGRADE_PROPERTIES } from '@/lib/cards';

export default function StageBreakOverlay({
  game,
  onAction,
}: {
  game: GameState;
  onAction: (action: GameAction, playerIndex?: number) => void;
}) {
  return (
    <div className="trail-card p-5 max-w-lg w-full max-h-[70vh] overflow-y-auto">
      <h2 className="wpa-heading text-lg font-bold mb-3 text-center" style={{ color: '#D4A847' }}>
        Stage Break &mdash; Upgrade Shop
      </h2>
      {game.players.map((player, pi) => (
        <div key={player.id} className="mb-4">
          <div className="text-xs font-bold mb-1" style={{ color: '#E8D5B7' }}>
            {player.name} &mdash; <span style={{ color: '#B898D0' }}>{player.flow} Flow</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_UPGRADE_TYPES.map((upgrade) => {
              const props = UPGRADE_PROPERTIES[upgrade];
              const owned = player.upgrades.includes(upgrade);
              const canAfford = player.flow >= props.flowCost;
              return (
                <button
                  key={upgrade}
                  onClick={() => onAction({ type: 'buy_upgrade', payload: { upgrade } }, pi)}
                  disabled={owned || !canAfford}
                  className={`text-left p-1.5 text-[10px] transition-colors ${
                    owned ? 'upgrade-card opacity-60' : canAfford ? 'upgrade-card' : 'upgrade-card opacity-40'
                  }`}
                >
                  <div className="font-bold">
                    {props.name}{' '}
                    <span style={{ color: '#D4A847' }}>({props.flowCost}F)</span>
                  </div>
                  <div style={{ color: 'rgba(184,221,216,0.6)' }}>{props.description}</div>
                  {owned && <div className="text-[9px]" style={{ color: '#7BC47F' }}>Owned</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
