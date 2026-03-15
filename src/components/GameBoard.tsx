'use client';

import { PlayerState, ProgressObstacle, CardSymbol, MainTrailCard } from '@/lib/types';
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

// ── Trail Card Display ──
export function TrailCardDisplay({
  card,
  label,
  faceDown,
}: {
  card: MainTrailCard | null;
  label?: string;
  faceDown?: boolean;
}) {
  if (faceDown || !card) {
    return (
      <div
        className="card-back flex items-center justify-center"
        style={{ width: '140px', height: '200px' }}
      >
        {label && (
          <div className="text-white/60 text-xs font-bold bg-black/40 rounded px-2 py-1">{label}</div>
        )}
      </div>
    );
  }

  // Map lane index to column label
  const colLabel = (lane: number) => `C${lane + 1}`;

  // Build row data: for each of rows 0-4, check if this row is checked and what its target lane is
  const rowData: { row: number; isChecked: boolean; targetLane: number }[] = [];
  for (let r = 0; r < 5; r++) {
    const checkIdx = card.checkedRows.indexOf(r);
    rowData.push({
      row: r,
      isChecked: checkIdx >= 0,
      targetLane: checkIdx >= 0 ? card.targetLanes[checkIdx] : -1,
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{label}</div>
      )}
      <div
        className="relative overflow-hidden"
        style={{
          width: '140px',
          height: '200px',
          borderRadius: '12px',
          border: '4px solid',
          borderImage: 'linear-gradient(145deg, #6a3093, #a044ff, #3a0d6e) 1',
          boxShadow: '0 4px 16px rgba(100,50,180,0.4), inset 0 0 0 2px rgba(60,140,255,0.5)',
        }}
      >
        {/* Inner dashed border */}
        <div
          className="absolute inset-1 rounded-lg pointer-events-none z-10"
          style={{
            border: '2px dashed rgba(80,180,255,0.5)',
          }}
        />

        {/* Forest trail background */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(180deg,
                rgba(20,80,40,0.95) 0%,
                rgba(40,100,50,0.85) 15%,
                rgba(80,130,60,0.7) 30%,
                rgba(140,120,70,0.8) 50%,
                rgba(120,90,50,0.9) 65%,
                rgba(80,60,30,0.95) 80%,
                rgba(50,35,15,1) 100%
              )`,
          }}
        />
        {/* Tree silhouettes at top */}
        <div
          className="absolute inset-x-0 top-0 h-16 pointer-events-none"
          style={{
            background: `
              linear-gradient(180deg, rgba(10,40,15,0.9) 0%, transparent 100%)`,
          }}
        />
        {/* Trail path line through middle */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '40%',
            left: '15%',
            right: '15%',
            height: '3px',
            background: 'linear-gradient(90deg, transparent, rgba(200,180,140,0.6), rgba(200,180,140,0.4), transparent)',
            borderRadius: '2px',
            transform: 'rotate(-5deg)',
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            top: '55%',
            left: '10%',
            right: '20%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(180,160,120,0.4), rgba(180,160,120,0.3), transparent)',
            borderRadius: '2px',
            transform: 'rotate(3deg)',
          }}
        />

        {/* Speed limit badge - top left */}
        <div
          className="absolute top-3 left-3 z-20 flex items-center gap-1"
          style={{
            background: 'rgba(0,100,200,0.9)',
            borderRadius: '6px',
            padding: '3px 8px 3px 6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            border: '1px solid rgba(100,180,255,0.5)',
          }}
        >
          {/* Mountain/chevron icon */}
          <svg width="18" height="14" viewBox="0 0 18 14" className="flex-shrink-0">
            <path d="M2 12 L9 3 L16 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 12 L9 7 L12 12" fill="none" stroke="rgba(100,200,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-white font-bold text-lg leading-none">{card.speedLimit}</span>
        </div>

        {/* Row check indicators - right side */}
        <div className="absolute right-3 top-8 bottom-6 z-20 flex flex-col justify-between items-center" style={{ width: '28px' }}>
          {rowData.map(({ row, isChecked, targetLane }) => (
            <div key={row} className="relative flex items-center">
              {isChecked ? (
                <div
                  className="flex items-center justify-center rounded-full font-bold text-white text-xs"
                  style={{
                    width: '24px',
                    height: '24px',
                    background: 'radial-gradient(circle at 40% 35%, #4dd9f5, #00b4d8 60%, #0077b6)',
                    boxShadow: '0 2px 8px rgba(0,180,220,0.6), inset 0 1px 2px rgba(255,255,255,0.4)',
                    border: '1.5px solid rgba(200,240,255,0.6)',
                  }}
                >
                  {colLabel(targetLane)}
                </div>
              ) : (
                <div
                  className="rounded-full"
                  style={{
                    width: '8px',
                    height: '8px',
                    background: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Connecting line between checked rows */}
        <svg className="absolute right-3 top-8 z-10 pointer-events-none" style={{ width: '28px', bottom: '24px', height: 'calc(100% - 56px)' }}>
          {(() => {
            const checkedPositions = rowData
              .map((rd, i) => ({ ...rd, yPct: i / 4 }))
              .filter(rd => rd.isChecked);
            if (checkedPositions.length < 2) return null;
            return checkedPositions.slice(0, -1).map((pos, i) => {
              const next = checkedPositions[i + 1];
              return (
                <line
                  key={i}
                  x1="14"
                  y1={`${pos.yPct * 100}%`}
                  x2="14"
                  y2={`${next.yPct * 100}%`}
                  stroke="rgba(80,200,240,0.5)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              );
            });
          })()}
        </svg>

        {/* Card name banner at bottom */}
        <div
          className="absolute bottom-0 inset-x-0 z-20 text-center py-1.5 px-2"
          style={{
            background: 'linear-gradient(0deg, rgba(0,0,0,0.85), rgba(0,0,0,0.5))',
          }}
        >
          <div className="text-white font-bold text-xs tracking-wide drop-shadow-md">{card.name}</div>
          <div className="text-[9px] text-cyan-300/70">
            {card.checkedRows.length} row{card.checkedRows.length !== 1 ? 's' : ''} checked
          </div>
        </div>
      </div>
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
