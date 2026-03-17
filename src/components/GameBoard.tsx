'use client';

import { PlayerState, ObstacleType, TechniqueType, TrailStage, CardSymbol } from '@/lib/types';
import {
  SYMBOL_COLORS, SYMBOL_EMOJI,
  getTechniqueSymbol, getTechniqueName, getTechniqueActionText,
  getObstacleSymbols, getObstacleName,
  getTrailStageName, getTrailStageSpeedLimit, getTrailStageCheckedRows, getTrailStageTargetLanes,
} from '@/lib/cards';

interface GameBoardProps {
  player: PlayerState;
  checkedRows?: number[];
  targetLanes?: number[];
  onCellClick?: (row: number, col: number) => void;
  compact?: boolean;
  /** Row index of the currently selected token for steering */
  selectedSteerRow?: number | null;
  /** Whether click-to-steer is enabled (sprint phase, actions remaining) */
  steerEnabled?: boolean;
  /** Called when a token is clicked to select it for steering */
  onTokenSelect?: (row: number) => void;
  /** Called when a valid steer target cell is clicked */
  onSteerTo?: (row: number, direction: number) => void;
}

export default function GameBoard({
  player, checkedRows = [], targetLanes = [], onCellClick, compact,
  selectedSteerRow, steerEnabled, onTokenSelect, onSteerTo,
}: GameBoardProps) {
  // Sizes
  const spotSize = compact ? 20 : 36;
  const rowGap = compact ? 3 : 10;
  const cols = 5;
  const boardWidth = cols * spotSize + (cols - 1) * 4;
  const boardHeight = player.grid.length * (spotSize + rowGap) - rowGap;

  function getTokenCol(row: number): number {
    for (let c = 0; c < 5; c++) {
      if (player.grid[row][c]) return c;
    }
    return -1;
  }

  // Compute spot positions for SVG trail lines
  function spotX(col: number): number {
    return col * (spotSize + 4) + spotSize / 2;
  }
  function spotY(row: number): number {
    return row * (spotSize + rowGap) + spotSize / 2;
  }

  // Build trail line connecting token positions between rows
  const tokenPositions = player.grid.map((_, r) => ({
    row: r,
    col: getTokenCol(r),
  })).filter(p => p.col >= 0);

  return (
    <div className="inline-block">
      <div className="text-sm font-bold mb-1 text-center text-amber-200 tracking-wide drop-shadow-md">{player.name}</div>
      <div
        className="relative rounded-lg overflow-hidden"
        style={{
          width: boardWidth + 8,
          height: boardHeight + 8,
          padding: '4px',
          background: 'linear-gradient(180deg, #0f3a1c 0%, #1a5c2e 30%, #2a6b3a 50%, #1a5c2e 70%, #0a2812 100%)',
          border: '3px solid #2a1a0a',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4), 2px 3px 10px rgba(0,0,0,0.6)',
        }}
      >
        {/* SVG trail path connecting tokens */}
        <svg
          className="absolute top-1 left-1 pointer-events-none"
          width={boardWidth}
          height={boardHeight}
          style={{ zIndex: 1 }}
        >
          {/* Trail dust / path between token positions */}
          {tokenPositions.length > 1 && tokenPositions.slice(0, -1).map((pos, i) => {
            const next = tokenPositions[i + 1];
            return (
              <line
                key={`trail-${i}`}
                x1={spotX(pos.col)}
                y1={spotY(pos.row)}
                x2={spotX(next.col)}
                y2={spotY(next.row)}
                stroke="rgba(180,160,120,0.3)"
                strokeWidth={compact ? 3 : 4}
                strokeLinecap="round"
                strokeDasharray="6 4"
              />
            );
          })}
          {/* Subtle center line for the trail */}
          <line
            x1={spotX(2)}
            y1={0}
            x2={spotX(2)}
            y2={boardHeight}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={compact ? 14 : 20}
            strokeLinecap="round"
          />
        </svg>

        {/* Grid rows */}
        <div className="relative" style={{ zIndex: 2 }}>
          {player.grid.map((row, r) => {
            const isChecked = checkedRows.includes(r);
            const targetLane = isChecked ? targetLanes[checkedRows.indexOf(r)] : -1;
            const tokenCol = getTokenCol(r);
            const isSelectedRow = selectedSteerRow === r;
            const validSteerTargets: number[] = [];
            if (isSelectedRow && tokenCol >= 0) {
              if (tokenCol > 0) validSteerTargets.push(tokenCol - 1);
              if (tokenCol < 4) validSteerTargets.push(tokenCol + 1);
            }

            return (
              <div
                key={r}
                className="flex items-center"
                style={{
                  gap: '4px',
                  marginBottom: r < player.grid.length - 1 ? rowGap : 0,
                }}
              >
                {row.map((hasToken, c) => {
                  const isTarget = isChecked && c === targetLane;
                  const isCenter = c === 2;
                  const isValidSteerTarget = validSteerTargets.includes(c);
                  const isSelectedToken = isSelectedRow && hasToken;

                  const handleClick = () => {
                    if (isValidSteerTarget && onSteerTo) {
                      onSteerTo(r, c - tokenCol);
                    } else if (hasToken && steerEnabled && onTokenSelect) {
                      onTokenSelect(r);
                    }
                    onCellClick?.(r, c);
                  };

                  return (
                    <div
                      key={c}
                      onClick={handleClick}
                      className="flex items-center justify-center cursor-pointer transition-all duration-150"
                      style={{
                        width: spotSize,
                        height: spotSize,
                        borderRadius: '50%',
                        background: hasToken
                          ? 'none'
                          : isValidSteerTarget
                            ? 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)'
                            : isTarget
                              ? 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, transparent 70%)'
                              : isCenter
                                ? 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)'
                                : 'none',
                        border: isValidSteerTarget
                          ? '2px dashed rgba(96,165,250,0.6)'
                          : isSelectedToken
                            ? '2px solid rgba(250,204,21,0.7)'
                            : isTarget && !hasToken
                              ? '1.5px dashed rgba(212,175,55,0.5)'
                              : '1px solid rgba(255,255,255,0.06)',
                        boxShadow: isValidSteerTarget
                          ? '0 0 8px rgba(59,130,246,0.3)'
                          : isSelectedToken
                            ? '0 0 10px rgba(250,204,21,0.4)'
                            : 'none',
                      }}
                    >
                      {hasToken && (
                        <div
                          className={`rounded-full transition-transform ${isSelectedToken ? 'scale-110' : ''}`}
                          style={{
                            width: spotSize - (compact ? 8 : 10),
                            height: spotSize - (compact ? 8 : 10),
                            background: isSelectedToken
                              ? 'radial-gradient(circle at 35% 35%, #fde68a 0%, #facc15 40%, #ca8a04 100%)'
                              : 'radial-gradient(circle at 35% 35%, #6ee7a0 0%, #10b981 40%, #047857 100%)',
                            border: isSelectedToken ? '2px solid #fef08a' : '2px solid #a7f3d0',
                            boxShadow: isSelectedToken
                              ? '0 2px 10px rgba(250,204,21,0.6), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.4)'
                              : '0 2px 6px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)',
                          }}
                        />
                      )}
                      {isValidSteerTarget && !hasToken && (
                        <div
                          className="rounded-full animate-pulse"
                          style={{
                            width: compact ? 10 : 14,
                            height: compact ? 10 : 14,
                            background: 'rgba(96,165,250,0.4)',
                            boxShadow: '0 0 8px rgba(59,130,246,0.3)',
                          }}
                        />
                      )}
                      {isTarget && !hasToken && !isValidSteerTarget && (
                        <div
                          className="rounded-full"
                          style={{
                            width: compact ? 8 : 10,
                            height: compact ? 8 : 10,
                            background: 'rgba(212,175,55,0.4)',
                            boxShadow: '0 0 4px rgba(212,175,55,0.3)',
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
      {/* Steer hint */}
      {steerEnabled && selectedSteerRow === null && (
        <div className="text-[9px] text-center mt-1 text-blue-300/50">Click a token to steer</div>
      )}
      {selectedSteerRow != null && (
        <div className="text-[9px] text-center mt-1 text-yellow-300/70">Click adjacent cell to move &middot; Click token again to deselect</div>
      )}
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
  compact,
}: {
  card: TrailStage | null;
  label?: string;
  faceDown?: boolean;
  compact?: boolean;
}) {
  const cardWidth = compact ? 100 : 140;
  const cardHeight = compact ? 140 : 200;

  if (faceDown || !card) {
    return (
      <div
        className="card-back flex items-center justify-center"
        style={{ width: `${cardWidth}px`, height: `${cardHeight}px` }}
      >
        {label && (
          <div className="text-white/60 text-xs font-bold bg-black/40 rounded px-2 py-1">{label}</div>
        )}
      </div>
    );
  }

  const cardName = getTrailStageName(card);
  const speedLimit = getTrailStageSpeedLimit(card);
  const cardCheckedRows = getTrailStageCheckedRows(card);
  const cardTargetLanes = getTrailStageTargetLanes(card);

  // Map lane index to column label
  const colLabel = (lane: number) => `C${lane + 1}`;

  // Build row data: for each of rows 0-4, check if this row is checked and what its target lane is
  const rowData: { row: number; isChecked: boolean; targetLane: number }[] = [];
  for (let r = 0; r < 5; r++) {
    const checkIdx = cardCheckedRows.indexOf(r);
    rowData.push({
      row: r,
      isChecked: checkIdx >= 0,
      targetLane: checkIdx >= 0 ? cardTargetLanes[checkIdx] : -1,
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
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
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
          className={`absolute ${compact ? 'top-2 left-2' : 'top-3 left-3'} z-20 flex items-center gap-1`}
          style={{
            background: 'rgba(0,100,200,0.9)',
            borderRadius: compact ? '4px' : '6px',
            padding: compact ? '2px 5px 2px 4px' : '3px 8px 3px 6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            border: '1px solid rgba(100,180,255,0.5)',
          }}
        >
          {/* Mountain/chevron icon */}
          <svg width={compact ? 12 : 18} height={compact ? 10 : 14} viewBox="0 0 18 14" className="flex-shrink-0">
            <path d="M2 12 L9 3 L16 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 12 L9 7 L12 12" fill="none" stroke="rgba(100,200,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`text-white font-bold ${compact ? 'text-sm' : 'text-lg'} leading-none`}>{speedLimit}</span>
        </div>

        {/* Row check indicators - right side */}
        <div className={`absolute ${compact ? 'right-2 top-6 bottom-4' : 'right-3 top-8 bottom-6'} z-20 flex flex-col justify-between items-center`} style={{ width: compact ? '22px' : '28px' }}>
          {rowData.map(({ row, isChecked, targetLane }) => (
            <div key={row} className="relative flex items-center">
              {isChecked ? (
                <div
                  className={`flex items-center justify-center rounded-full font-bold text-white ${compact ? 'text-[9px]' : 'text-xs'}`}
                  style={{
                    width: compact ? '18px' : '24px',
                    height: compact ? '18px' : '24px',
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
        <svg className={`absolute ${compact ? 'right-2 top-6' : 'right-3 top-8'} z-10 pointer-events-none`} style={{ width: compact ? '22px' : '28px', bottom: compact ? '16px' : '24px', height: compact ? 'calc(100% - 40px)' : 'calc(100% - 56px)' }}>
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
          <div className="text-white font-bold text-xs tracking-wide drop-shadow-md">{cardName}</div>
          <div className="text-[9px] text-cyan-300/70">
            {cardCheckedRows.length} row{cardCheckedRows.length !== 1 ? 's' : ''} checked
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
  hand: TechniqueType[];
  onPlay?: (index: number) => void;
  disabled?: boolean;
  activeObstacles?: ObstacleType[];
}) {
  if (hand.length === 0) return <div className="text-sm" style={{ color: '#8a7a6a' }}>No cards in hand</div>;

  // Find which obstacle symbols are needed
  const neededSymbols = new Set<CardSymbol>();
  for (const obs of activeObstacles) {
    for (const sym of getObstacleSymbols(obs)) {
      neededSymbols.add(sym);
    }
  }

  // Find which obstacles each card symbol matches
  function getMatchingObstacles(symbol: CardSymbol): ObstacleType[] {
    return activeObstacles.filter(obs => getObstacleSymbols(obs).includes(symbol));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {hand.map((card, i) => {
        const cardSymbol = getTechniqueSymbol(card);
        const cardName = getTechniqueName(card);
        const cardActionText = getTechniqueActionText(card);
        const matchingObs = getMatchingObstacles(cardSymbol);
        const hasMatch = matchingObs.length > 0;

        const canPlay = !disabled && !!onPlay;

        return (
          <button
            key={`${card}-${i}`}
            onClick={() => onPlay?.(i)}
            disabled={disabled}
            className={`playing-card text-left flex flex-col relative transition-all duration-150 ${
              canPlay ? 'hover:-translate-y-1 hover:scale-105 cursor-pointer' : ''
            } ${disabled ? 'opacity-60' : ''}`}
            style={{
              width: '95px',
              height: '125px',
              padding: '6px',
              boxShadow: hasMatch
                ? `0 0 12px ${SYMBOL_COLORS[cardSymbol]}90, 0 0 4px ${SYMBOL_COLORS[cardSymbol]}60`
                : canPlay
                  ? `0 4px 12px rgba(0,0,0,0.3)`
                  : undefined,
              border: hasMatch ? `2px solid ${SYMBOL_COLORS[cardSymbol]}` : undefined,
            }}
          >
            {/* Match indicator badge */}
            {hasMatch && (
              <div
                className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white"
                style={{ backgroundColor: SYMBOL_COLORS[cardSymbol], boxShadow: `0 0 6px ${SYMBOL_COLORS[cardSymbol]}` }}
              >
                MATCH
              </div>
            )}
            {/* Playable indicator */}
            {canPlay && !hasMatch && (
              <div
                className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{ backgroundColor: SYMBOL_COLORS[cardSymbol], color: 'white', boxShadow: `0 0 6px ${SYMBOL_COLORS[cardSymbol]}80` }}
              >
                PLAY
              </div>
            )}
            {/* Symbol display - always visible */}
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-lg">{SYMBOL_EMOJI[cardSymbol]}</span>
              <div className="flex flex-col">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border border-white/30"
                  style={{
                    backgroundColor: SYMBOL_COLORS[cardSymbol],
                    boxShadow: `0 0 4px ${SYMBOL_COLORS[cardSymbol]}80`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono uppercase font-bold" style={{ color: SYMBOL_COLORS[cardSymbol] }}>
                {cardSymbol}
              </span>
            </div>
            {/* Card name */}
            <div className="font-bold text-xs leading-tight" style={{ color: '#1a1a1a' }}>
              {cardName}
            </div>
            {/* Matching obstacle indicator */}
            {hasMatch && (
              <div className="flex flex-wrap gap-0.5 mt-1">
                {matchingObs.map((obs, j) => (
                  <div key={j} className="flex items-center gap-0.5 rounded px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}>
                    {getObstacleSymbols(obs).map((sym, k) => (
                      <span key={k} className="text-xs">{SYMBOL_EMOJI[sym]}</span>
                    ))}
                    <span className="text-[8px]" style={{ color: '#444' }}>{getObstacleName(obs)}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Action text — highlighted when playable */}
            <div
              className={`text-[10px] leading-snug mt-auto rounded px-1 py-0.5 -mx-1 ${canPlay ? 'font-semibold' : ''}`}
              style={{
                color: canPlay ? SYMBOL_COLORS[cardSymbol] : '#5a5040',
                backgroundColor: canPlay ? `${SYMBOL_COLORS[cardSymbol]}12` : undefined,
              }}
            >
              {cardActionText}
            </div>
          </button>
        );
      })}
    </div>
  );
}
