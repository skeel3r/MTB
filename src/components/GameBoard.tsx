'use client';

import { PlayerState } from '@/lib/types';
import { SYMBOL_COLORS } from '@/lib/cards';

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
      <div className="text-sm font-bold mb-1 text-center">{player.name}</div>
      <div className="border-2 border-gray-600 rounded-lg overflow-hidden bg-gray-900">
        {/* Column headers */}
        <div className="flex">
          <div className={`${labelSize} flex-shrink-0`} />
          {[1, 2, 3, 4, 5].map(c => (
            <div key={c} className={`${cellSize} flex items-center justify-center text-[10px] sm:text-xs text-gray-500 font-mono`}>
              L{c}
            </div>
          ))}
        </div>

        {player.grid.map((row, r) => {
          const isChecked = checkedRows.includes(r);
          const targetLane = isChecked ? targetLanes[checkedRows.indexOf(r)] : -1;

          return (
            <div key={r} className="flex">
              {/* Row label */}
              <div className={`${labelSize} flex items-center justify-center text-[10px] sm:text-xs font-mono ${isChecked ? 'text-yellow-400 font-bold' : 'text-gray-500'}`}>
                R{r + 1}
              </div>

              {row.map((hasToken, c) => {
                const isTarget = isChecked && c === targetLane;
                const isToken = hasToken;
                const isCenter = c === 2;

                return (
                  <div
                    key={c}
                    onClick={() => onCellClick?.(r, c)}
                    className={`
                      ${cellSize} border border-gray-700 flex items-center justify-center
                      cursor-pointer transition-all duration-150
                      ${isTarget ? 'bg-yellow-900/40 border-yellow-500' : ''}
                      ${isCenter && !isTarget ? 'bg-gray-800/50' : ''}
                      ${!isTarget && !isCenter ? 'bg-gray-900' : ''}
                      hover:bg-gray-700
                    `}
                  >
                    {isToken && (
                      <div className={`${tokenSize} rounded-full bg-emerald-500 border-2 border-emerald-300 shadow-lg shadow-emerald-500/30`} />
                    )}
                    {isTarget && !isToken && (
                      <div className={`${targetDotSize} rounded-full border-2 border-dashed border-yellow-500/50`} />
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
    <div className="bg-gray-800 rounded-lg p-3 text-sm space-y-1">
      <div className="font-bold text-lg">{player.name}</div>
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
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ── Hand Display ──
export function HandDisplay({
  hand,
  onPlay,
  disabled,
}: {
  hand: PlayerState['hand'];
  onPlay?: (index: number) => void;
  disabled?: boolean;
}) {
  if (hand.length === 0) return <div className="text-gray-500 text-sm">No cards in hand</div>;

  return (
    <div className="flex flex-wrap gap-2">
      {hand.map((card, i) => (
        <button
          key={card.id}
          onClick={() => onPlay?.(i)}
          disabled={disabled}
          className="bg-gray-800 border border-gray-600 rounded-lg p-2 text-left text-xs hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors max-w-[160px]"
        >
          <div className="font-bold flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: SYMBOL_COLORS[card.symbol] }}
            />
            {card.name}
          </div>
          <div className="text-gray-400 mt-1">{card.actionText}</div>
        </button>
      ))}
    </div>
  );
}
