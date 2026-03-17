import { GameState } from './types';
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
 * Check if the player can match a given obstacle with their current hand.
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
 * Resolve any pending obstacles. AI matches if it can, otherwise takes penalty.
 */
function resolveActiveObstacles(state: GameState, playerIndex: number): GameState {
  let s = state;
  // Resolve obstacles one at a time (each resolve removes one from activeObstacles)
  while (s.activeObstacles.length > 0 && !s.players[playerIndex].crashed && !s.players[playerIndex].turnEnded) {
    const obs = s.activeObstacles[0];
    const player = s.players[playerIndex];
    const mode = obs.matchMode ?? 'all';
    const hasMatch = canMatchObstacle(player.hand, obs.symbols, mode);
    const choice = hasMatch ? 'match' : 'take_penalty';
    s = processAction(s, playerIndex, {
      type: 'resolve_obstacle',
      payload: { obstacleIndex: 0, choice },
    });
  }
  return s;
}

/**
 * Trail Read: Try to reuse revealed obstacles that the player can match.
 * Returns updated state and the number of obstacles reused.
 */
function tryReuseRevealedObstacles(state: GameState, playerIndex: number, maxReuse: number): { state: GameState; reused: number } {
  let s = state;
  let reused = 0;
  const p = () => s.players[playerIndex];

  // Don't reuse if player already drew fresh
  if (p().drewFreshObstacle) return { state: s, reused: 0 };

  for (let attempt = 0; attempt < maxReuse && !p().crashed && !p().turnEnded; attempt++) {
    // Find a revealed obstacle the player can match
    const revealed = s.roundRevealedObstacles;
    let bestIdx = -1;
    for (let i = 0; i < revealed.length; i++) {
      const obs = revealed[i];
      const mode = obs.matchMode ?? 'all';
      if (canMatchObstacle(p().hand, obs.symbols, mode)) {
        bestIdx = i;
        break;
      }
    }
    if (bestIdx < 0) break;

    // Reuse the revealed obstacle
    s = processAction(s, playerIndex, { type: 'reuse_obstacle', payload: { revealedIndex: bestIdx } });
    s = resolveActiveObstacles(s, playerIndex);
    reused++;
  }

  return { state: s, reused };
}

/**
 * Execute one full AI turn for the given player during the sprint phase.
 * Returns the updated game state after all AI actions.
 */
export function aiPlaySprint(state: GameState, playerIndex: number): GameState {
  let s = state;
  const p = () => s.players[playerIndex];

  // Trail Read: reuse scales with how many player lines are visible
  // More players ahead = more obstacles to pick from = bigger advantage
  const linesAvailable = Object.keys(s.playerObstacleLines).length;
  const maxReuse = Math.max(1, linesAvailable); // P2: 1, P3: 2, P4: 3
  const { state: afterReuse, reused } = tryReuseRevealedObstacles(s, playerIndex, maxReuse);
  s = afterReuse;

  // Draw fresh obstacles if we haven't tackled enough yet
  const targetObstacles = Math.max(1, Math.min(2, 1 + linesAvailable)); // more lines = less need to draw fresh
  const freshNeeded = Math.max(0, (p().hand.length >= 3 ? targetObstacles : 1) - reused);

  for (let i = 0; i < freshNeeded && !p().crashed && !p().turnEnded; i++) {
    // Skip second fresh draw if hand is too small
    if (i > 0 && p().hand.length < 3) break;
    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
    s = resolveActiveObstacles(s, playerIndex);
  }

  // Spend actions
  let safety = 20;
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

    // Priority 3: Play a technique card — pick based on game state
    if (player.hand.length > 0) {
      let bestIndex = 0;
      // Play Recover if high hazard dice, Flick/Manual if off-center
      if (player.hazardDice >= 3) {
        const recoverIdx = player.hand.findIndex(c => c.name === 'Recover');
        if (recoverIdx >= 0) bestIndex = recoverIdx;
      } else {
        // Check if tokens are off center
        let offCenter = 0;
        for (let r = 0; r < 6; r++) {
          const col = getTokenCol(player.grid, r);
          if (col >= 0 && col !== 2) offCenter++;
        }
        if (offCenter >= 2) {
          const flickIdx = player.hand.findIndex(c => c.name === 'Flick');
          if (flickIdx >= 0) bestIndex = flickIdx;
        }
      }
      s = processAction(s, playerIndex, { type: 'technique', payload: { cardIndex: bestIndex } });
      continue;
    }

    // Priority 4: Pedal more if still have actions
    if (!player.cannotPedal) {
      s = processAction(s, playerIndex, { type: 'pedal' });
      continue;
    }

    // Nothing useful to do
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
  return processAction(state, playerIndex, {
    type: 'commit_line',
    payload: { line: 'main' },
  });
}
