'use client';

import { PlayerState, ProgressObstacle, CardSymbol } from '@/lib/types';
import { SYMBOL_COLORS, SYMBOL_EMOJI } from '@/lib/cards';

interface GameBoardProps {
  player: PlayerState;
  checkedRows?: number[];
  targetLanes?: number[];
  onCellClick?: (row: number, col: number) => void;
  compact?: boolean;
}

export default function GameBoard({ player, checkedRows = [], targetLanes = [], onCellClick, compact }: GameBoardProps) {
  const cellSize = compact ? 'w-8 h-8' : 'w-9 h-9 sm:w-12 sm:h-12';
  const labelSize = compact ? 'w-8' : 'w-9 sm:w-12';
  const tokenSize = compact ? 'w-5 h-5' : 'w-6 h-6 sm:w-8 sm:h-8';
  const targetDotSize = compact ? 'w-4 h-4' : 'w-4 h-4 sm:w-6 sm:h-6';

  return (
    <div className="inline-block">
      <div className="text-sm font-bold mb-1 text-center text-amber-200 tracking-wide drop-shadow-md">{player.name}</div>
      <div
        className="rounded-lg overflow-hidden p-1"
        style={{
          background: 'radial-gradient(ellipse at center, #1a5c2e 0%, #0f3a1c 60%, #0a2812 100%)',
          border: '3px solid #2a1a0a',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4), 2px 3px 10px rgba(0,0,0,0.6)',
        }}
      >
        {/* Column headers */}
        <div className="flex">
          <div className={`${labelSize} flex-shrink-0`} />
          {[1, 2, 3, 4, 5].map(c => (
            <div key={c} className={`${cellSize} flex items-center justify-center text-[10px] sm:text-xs font-mono`} style={{ color: '#8aad8a' }}>
              C{c}
            </div>
          ))}
        </div>

        {player.grid.map((row, r) => {
          const isChecked = checkedRows.includes(r);
          const targetLane = isChecked ? targetLanes[checkedRows.indexOf(r)] : -1;

          return (
            <div key={r} className="flex">
              {/* Row label */}
              <div className={`${labelSize} flex items-center justify-center text-[10px] sm:text-xs font-mono ${isChecked ? 'text-yellow-400 font-bold' : ''}`} style={!isChecked ? { color: '#8aad8a' } : undefined}>
                R{r + 1}
              </div>

              {row.map((hasToken, c) => {
                const isTarget = isChecked && c === targetLane;
                const isCenter = c === 2;

                return (
                  <div
                    key={c}
                    onClick={() => onCellClick?.(r, c)}
                    className={`${cellSize} flex items-center justify-center cursor-pointer transition-all duration-150`}
                    style={{
                      borderRadius: '4px',
                      margin: '1px',
                      background: isTarget
                        ? 'radial-gradient(circle, rgba(180,150,40,0.3) 0%, rgba(100,80,20,0.15) 100%)'
                        : isCenter
                          ? 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.15) 100%)'
                          : 'radial-gradient(circle, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.2) 100%)',
                      border: isTarget ? '1.5px solid rgba(200,170,50,0.6)' : '1px solid rgba(0,0,0,0.25)',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  >
                    {hasToken && (
                      <div
                        className={`${tokenSize} rounded-full`}
                        style={{
                          background: 'radial-gradient(circle at 35% 35%, #6ee7a0 0%, #10b981 40%, #047857 100%)',
                          border: '2px solid #a7f3d0',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)',
                        }}
                      />
                    )}
                    {isTarget && !hasToken && (
                      <div
                        className={`${targetDotSize} rounded-full`}
                        style={{
                          border: '2px dashed rgba(212,175,55,0.6)',
                          boxShadow: '0 0 6px rgba(212,175,55,0.2)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stats Panel ──
export function PlayerStats({ player }: { player: PlayerState }) {
  return (
    <div
      className="rounded-lg p-3 text-sm space-y-1"
      style={{
        background: 'linear-gradient(145deg, #3d2b1a 0%, #2a1c0e 50%, #1f150a 100%)',
        border: '2px solid #5a3d20',
        boxShadow: 'inset 0 1px 0 rgba(255,220,150,0.1), 2px 3px 8px rgba(0,0,0,0.5)',
      }}
    >
      <div className="font-bold text-lg text-amber-200 drop-shadow-md">{player.name}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <StatRow label="Progress" value={player.progress} color="text-green-400" />
        <StatRow label="Momentum" value={player.momentum} color="text-blue-400" />
        <StatRow label="Flow" value={player.flow} color="text-purple-400" />
        <StatRow label="Hazard Dice" value={player.hazardDice} color="text-red-400" />
        <StatRow label="Actions" value={player.actionsRemaining} color="text-yellow-400" />
        <StatRow label="Hand" value={player.hand.length} color="text-gray-300" />
        <StatRow label="Penalties" value={player.penalties.length} color="text-orange-400" />
        <StatRow label="Line" value={player.commitment === 'pro' ? 'PRO' : 'Main'} color={player.commitment === 'pro' ? 'text-red-400' : 'text-gray-300'} />
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: '#b8a080' }}>{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ── Hand Display ──
export function HandDisplay({
  hand,
  onPlay,
  disabled,
  activeObstacles = [],
}: {
  hand: PlayerState['hand'];
  onPlay?: (index: number) => void;
  disabled?: boolean;
  activeObstacles?: ProgressObstacle[];
}) {
  if (hand.length === 0) return <div className="text-sm" style={{ color: '#8a7a6a' }}>No cards in hand</div>;

  // Find which obstacle symbols are needed
  const neededSymbols = new Set<CardSymbol>();
  for (const obs of activeObstacles) {
    for (const sym of obs.symbols) {
      neededSymbols.add(sym);
    }
  }

  // Find which obstacles each card symbol matches
  function getMatchingObstacles(symbol: CardSymbol): ProgressObstacle[] {
    return activeObstacles.filter(obs => obs.symbols.includes(symbol));
  }

  return (
    <div className="flex flex-wrap gap-3">
      {hand.map((card, i) => {
        const matchingObs = getMatchingObstacles(card.symbol);
        const hasMatch = matchingObs.length > 0;

        return (
          <button
            key={card.id}
            onClick={() => onPlay?.(i)}
            disabled={disabled}
            className="playing-card text-left flex flex-col relative"
            style={{
              width: '120px',
              height: '170px',
              padding: '8px',
              boxShadow: hasMatch
                ? `0 0 12px ${SYMBOL_COLORS[card.symbol]}90, 0 0 4px ${SYMBOL_COLORS[card.symbol]}60`
                : undefined,
              border: hasMatch ? `2px solid ${SYMBOL_COLORS[card.symbol]}` : undefined,
            }}
          >
            {/* Match indicator badge */}
            {hasMatch && (
              <div
                className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white"
                style={{ backgroundColor: SYMBOL_COLORS[card.symbol], boxShadow: `0 0 6px ${SYMBOL_COLORS[card.symbol]}` }}
              >
                MATCH
              </div>
            )}
            {/* Symbol display - always visible */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-2xl">{SYMBOL_EMOJI[card.symbol]}</span>
              <div className="flex flex-col">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border border-white/30"
                  style={{
                    backgroundColor: SYMBOL_COLORS[card.symbol],
                    boxShadow: `0 0 4px ${SYMBOL_COLORS[card.symbol]}80`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono uppercase font-bold" style={{ color: SYMBOL_COLORS[card.symbol] }}>
                {card.symbol}
              </span>
            </div>
            {/* Card name */}
            <div className="font-bold text-xs leading-tight" style={{ color: '#1a1a1a' }}>
              {card.name}
            </div>
            {/* Matching obstacle indicator */}
            {hasMatch && (
              <div className="flex flex-wrap gap-0.5 mt-1">
                {matchingObs.map((obs, j) => (
                  <div key={j} className="flex items-center gap-0.5 rounded px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}>
                    {obs.symbols.map((sym, k) => (
                      <span key={k} className="text-xs">{SYMBOL_EMOJI[sym]}</span>
                    ))}
                    <span className="text-[8px]" style={{ color: '#444' }}>{obs.name}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Action text */}
            <div className="text-[10px] leading-snug mt-auto" style={{ color: '#5a5040' }}>
              {card.actionText}
            </div>
          </button>
        );
      })}
    </div>
  );
}
