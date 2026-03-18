import { TechniqueType, ObstacleType } from './types';
import { getTechniqueSymbol, getObstacleSymbols, getObstacleMatchMode } from './cards';

/**
 * Check if a hand of technique cards can match an obstacle.
 * Supports exact matches and wild matches (2 cards of same symbol = 1 wild).
 */
export function canMatchObstacle(hand: TechniqueType[], obstacle: ObstacleType): boolean {
  const symbols = getObstacleSymbols(obstacle);
  const matchMode = getObstacleMatchMode(obstacle);

  if (matchMode === 'any') {
    // Exact match: any 1 matching symbol
    if (symbols.some(sym => hand.some(c => getTechniqueSymbol(c) === sym))) return true;
    // Wild: any 2 cards of same symbol
    const counts: Record<string, number> = {};
    for (const c of hand) {
      const s = getTechniqueSymbol(c);
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.values(counts).some(n => n >= 2);
  }

  // mode === 'all': try exact + wild matching
  const usedIndices = new Set<number>();
  const unmatched: string[] = [];
  for (const sym of symbols) {
    const idx = hand.findIndex((c, ci) => getTechniqueSymbol(c) === sym && !usedIndices.has(ci));
    if (idx >= 0) usedIndices.add(idx);
    else unmatched.push(sym);
  }
  if (unmatched.length === 0) return true;

  // Try wilds for each unmatched symbol
  for (const _sym of unmatched) {
    const avail: Record<string, number[]> = {};
    for (let ci = 0; ci < hand.length; ci++) {
      if (usedIndices.has(ci)) continue;
      const s = getTechniqueSymbol(hand[ci]);
      if (!avail[s]) avail[s] = [];
      avail[s].push(ci);
    }
    let found = false;
    for (const indices of Object.values(avail)) {
      if (indices.length >= 2) {
        usedIndices.add(indices[0]);
        usedIndices.add(indices[1]);
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}
