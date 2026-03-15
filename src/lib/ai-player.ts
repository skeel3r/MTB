import { GameState, GameAction } from './types';
import { processAction } from './engine';

/**
 * Get the column of the token in a given row.
 */
function getTokenCol(grid: boolean[][], row: number): number {
  for (let c = 0; c < 5; c++) {
    if (grid[row][c]) return c;
  }
  return -1;
}

/**
 * Check if the AI player can match a given obstacle with their current hand.
 */
function canMatchObstacle(
  hand: { symbol: string }[],
  symbols: string[],
  matchMode: 'all' | 'any',
): boolean {
  const usedIndices = new Set<number>();
  if (matchMode === 'any') {
    return symbols.some(sym =>
      hand.some((c, i) => c.symbol === sym && !usedIndices.has(i) && (usedIndices.add(i), true)),
    );
  }
  return symbols.every(sym => {
    const idx = hand.findIndex((c, i) => c.symbol === sym && !usedIndices.has(i));
    if (idx >= 0) { usedIndices.add(idx); return true; }
    return false;
  });
}

/**
 * Execute one full AI turn for the given player during the sprint phase.
 * Returns the updated game state after all AI actions.
 */
export function aiPlaySprint(state: GameState, playerIndex: number): GameState {
  let s = state;
  const p = () => s.players[playerIndex];

  // AI flips 1-2 obstacles (free actions)
  if (!p().crashed && !p().turnEnded) {
    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
  }
  // Flip a second obstacle if hand is strong (3+ cards)
  if (!p().crashed && !p().turnEnded && p().hand.length >= 3) {
    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
  }

  // Spend actions
  let safety = 20; // prevent infinite loops
  while (p().actionsRemaining > 0 && !p().crashed && !p().turnEnded && safety-- > 0) {
    const player = p();

    // Priority 1: Steer off-center tokens toward center (costs 1 action)
    let steered = false;
    for (let r = 0; r < 6; r++) {
      const col = getTokenCol(player.grid, r);
      if (col >= 0 && col !== 2) {
        const dir = col > 2 ? -1 : 1;
        s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
        steered = true;
        break;
      }
    }
    if (steered) continue;

    // Priority 2: Pedal if momentum is low-ish
    if (player.momentum < 4 && !player.cannotPedal) {
      s = processAction(s, playerIndex, { type: 'pedal' });
      continue;
    }

    // Priority 3: Play a technique card if available
    if (player.hand.length > 0) {
      s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: 0 } });
      continue;
    }

    // Priority 4: Pedal more if still have actions
    if (!player.cannotPedal) {
      s = processAction(s, playerIndex, { type: 'pedal' });
      continue;
    }

    // Nothing useful to do, end turn
    break;
  }

  // End turn
  if (!p().turnEnded) {
    s = processAction(s, playerIndex, { type: 'end_turn' });
  }

  return s;
}

/**
 * Execute AI commitment phase choice.
 */
export function aiCommit(state: GameState, playerIndex: number): GameState {
  // AI always picks main line (safer)
  return processAction(state, playerIndex, {
    type: 'commit_line',
    payload: { line: 'main' },
  });
}
