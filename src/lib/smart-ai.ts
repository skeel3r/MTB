/**
 * Smart AI: State-evaluation-based decision engine.
 *
 * Instead of fixed heuristic priorities, this AI:
 * 1. Evaluates the current game state with a scoring function
 * 2. Enumerates all legal actions at each decision point
 * 3. Simulates each action's immediate outcome
 * 4. Picks the action with the highest expected state score
 *
 * Uses hypergeometric probability for obstacle matching decisions
 * and expected value calculations for action selection.
 */

import { GameState, PlayerState, CardSymbol, GameAction, ObstacleType, TechniqueType } from './types';
import { processAction } from './engine';
import {
  getTechniqueSymbol, getTechniqueName,
  getObstacleSymbols, getObstacleMatchMode, getObstacleSendItCost,
  getTrailStageSpeedLimit, getTrailStageCheckedRows, getTrailStageTargetLanes,
} from './cards';

// ═══════════════════════════════════════════════════════════
// Utility helpers
// ═══════════════════════════════════════════════════════════

function getTokenCol(grid: boolean[][], row: number): number {
  for (let c = 0; c < 5; c++) {
    if (grid[row][c]) return c;
  }
  return -1;
}

/** Check if hand can match obstacle (supports "Forced Through" wild matching) */
function canMatchObstacle(
  hand: TechniqueType[],
  obstacle: ObstacleType,
): boolean {
  const symbols = getObstacleSymbols(obstacle);
  const matchMode = getObstacleMatchMode(obstacle);
  const usedIndices = new Set<number>();

  if (matchMode === 'any') {
    // Exact match
    if (symbols.some(sym => hand.some((c, i) => getTechniqueSymbol(c) === sym && !usedIndices.has(i) && (usedIndices.add(i), true)))) {
      return true;
    }
    // Wild: any 2 cards of same symbol
    const counts: Record<string, number> = {};
    for (const c of hand) counts[getTechniqueSymbol(c)] = (counts[getTechniqueSymbol(c)] || 0) + 1;
    return Object.values(counts).some(n => n >= 2);
  }

  // mode === 'all': exact matches first, then wilds for remainder
  const unmatched: string[] = [];
  for (const sym of symbols) {
    const idx = hand.findIndex((c, i) => getTechniqueSymbol(c) === sym && !usedIndices.has(i));
    if (idx >= 0) usedIndices.add(idx);
    else unmatched.push(sym);
  }
  if (unmatched.length === 0) return true;

  // "Forced Through": 2 same-symbol cards = 1 wild match
  for (const _sym of unmatched) {
    const avail: Record<string, number[]> = {};
    for (let i = 0; i < hand.length; i++) {
      if (usedIndices.has(i)) continue;
      const s = getTechniqueSymbol(hand[i]);
      if (!avail[s]) avail[s] = [];
      avail[s].push(i);
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

// ═══════════════════════════════════════════════════════════
// Hypergeometric probability engine
// ═══════════════════════════════════════════════════════════

const _chooseCache = new Map<number, number>();
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  // Normalize: C(n,k) = C(n, n-k)
  const kk = k < n - k ? k : n - k;
  const key = n * 1000 + kk; // n < 1000 in practice
  const cached = _chooseCache.get(key);
  if (cached !== undefined) return cached;
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = result * (n - i) / (i + 1);
  }
  const val = Math.round(result);
  _chooseCache.set(key, val);
  return val;
}

/** P(hand of size h has at least 1 card of a symbol with K copies in deck of N) */
function pAtLeastOne(N: number, K: number, h: number): number {
  if (h <= 0 || K <= 0 || N <= 0) return 0;
  const safeH = Math.min(h, N);
  return 1 - choose(N - K, safeH) / choose(N, safeH);
}

/** P(matching an obstacle given hand size h and deck composition) */
function pMatchObstacle(
  symbols: CardSymbol[],
  matchMode: 'all' | 'any',
  handSize: number,
  deckSize: number,
  symbolCounts: Record<string, number>,
): number {
  if (handSize <= 0 || deckSize <= 0) return 0;
  const h = Math.min(handSize, deckSize);

  if (matchMode === 'any') {
    // P(at least one of any listed symbol)
    // = 1 - P(none of any listed symbol)
    let totalMissed = 0;
    for (const sym of symbols) totalMissed += (symbolCounts[sym] || 0);
    return 1 - choose(deckSize - totalMissed, h) / choose(deckSize, h);
  }

  // matchMode === 'all': need at least one of each symbol
  if (symbols.length === 1) {
    return pAtLeastOne(deckSize, symbolCounts[symbols[0]] || 0, h);
  }

  // For 2 symbols: inclusion-exclusion
  const Ka = symbolCounts[symbols[0]] || 0;
  const Kb = symbolCounts[symbols[1]] || 0;
  const pMissA = choose(deckSize - Ka, h) / choose(deckSize, h);
  const pMissB = choose(deckSize - Kb, h) / choose(deckSize, h);
  const pMissBoth = choose(deckSize - Ka - Kb, h) / choose(deckSize, h);
  return 1 - pMissA - pMissB + pMissBoth;
}

// ═══════════════════════════════════════════════════════════
// State Evaluation Function
// ═══════════════════════════════════════════════════════════

/**
 * Score weights — tuned to reflect game mechanics.
 * Higher is better for the player.
 */
const W = {
  // Direct scoring
  shred: 10.0,           // Shred is the win condition
  perfectMatch: 1.5,        // Tiebreaker value

  // Resources (future value)
  momentum: 0.8,            // Higher momentum = bigger hand next round = better obstacle matching
  momentumOverSpeed: -2.0,   // Penalty for momentum above speed limit (speed trap incoming)
  flow: 1.2,                // Flow enables powerful abilities
  handSize: 0.3,            // Cards in hand = matching potential

  // Risk
  hazardDice: -1.5,         // Each die = ~17% chance of penalty in reckoning
  hazardDiceHigh: -3.0,     // Extra penalty when approaching crash threshold (5+)
  penalty: -2.0,            // Active penalty cards reduce capabilities
  crashRisk: -15.0,         // Near-crash state is very dangerous

  // Grid alignment (for upcoming alignment check)
  alignmentPerfect: 3.0,    // All checked rows perfectly aligned
  alignmentClose: 0.5,      // Within 1 lane (no penalty)
  alignmentMiss: -1.5,      // 2+ lanes off (will cause hazard die)

  // Positional
  leadBonus: 0.5,           // Small bonus for being ahead (momentum advantage)
  trailReadValue: 0.8,      // Value of having revealed obstacles available

  // Obstacle matching potential
  handMatchPotential: 1.5,  // Expected ability to match future obstacles
};

interface StateEval {
  total: number;
  components: Record<string, number>;
}

export function evaluateState(state: GameState, playerIndex: number): StateEval {
  const player = state.players[playerIndex];
  const components: Record<string, number> = {};

  // Progress (the win condition)
  components.shred = player.shred * W.shred;
  components.perfectMatch = player.perfectMatches * W.perfectMatch;

  // Momentum value — beneficial up to speed limit, dangerous above
  const speedLimit = state.activeTrailCard ? getTrailStageSpeedLimit(state.activeTrailCard) : 6;
  const safeM = Math.min(player.momentum, speedLimit);
  const excessM = Math.max(0, player.momentum - speedLimit);
  components.momentum = safeM * W.momentum + excessM * W.momentumOverSpeed;

  // Flow
  components.flow = player.flow * W.flow;

  // Hand — value both size and composition diversity
  components.handSize = player.hand.length * W.handSize;

  // Hazard risk
  if (player.hazardDice >= 5) {
    components.hazardRisk = player.hazardDice * W.hazardDiceHigh + W.crashRisk;
  } else if (player.hazardDice >= 3) {
    components.hazardRisk = player.hazardDice * W.hazardDiceHigh;
  } else {
    components.hazardRisk = player.hazardDice * W.hazardDice;
  }

  // Penalty cards
  components.penalties = player.penalties.length * W.penalty;

  // Grid alignment quality (for the current trail card)
  if (state.activeTrailCard) {
    const checkedRows = getTrailStageCheckedRows(state.activeTrailCard);
    const targetLanes = getTrailStageTargetLanes(state.activeTrailCard);
    let alignScore = 0;
    let allPerfect = true;
    for (let i = 0; i < checkedRows.length; i++) {
      const row = checkedRows[i];
      const target = targetLanes[i];
      const col = getTokenCol(player.grid, row);
      if (col < 0) continue;
      const dist = Math.abs(col - target);
      if (dist === 0) {
        alignScore += W.alignmentClose; // perfect for this row
      } else if (dist === 1) {
        alignScore += W.alignmentClose * 0.5;
        allPerfect = false;
      } else {
        alignScore += W.alignmentMiss;
        allPerfect = false;
      }
    }
    if (allPerfect && checkedRows.length > 0) {
      alignScore += W.alignmentPerfect;
    }
    components.alignment = alignScore;
  } else {
    components.alignment = 0;
  }

  // Positional awareness
  const myShred = player.shred;
  const avgShred = state.players.reduce((s, p) => s + p.shred, 0) / state.players.length;
  components.position = (myShred - avgShred) * W.leadBonus;

  // Hand matching potential — expected probability of matching a random obstacle
  components.matchPotential = computeHandMatchPotential(player) * W.handMatchPotential;

  const total = Object.values(components).reduce((s, v) => s + v, 0);
  return { total, components };
}

/**
 * Compute expected obstacle matching ability from current hand.
 * Returns 0-1 representing avg probability of matching a random obstacle.
 */
function computeHandMatchPotential(player: PlayerState): number {
  const symbolCounts: Record<string, number> = {};
  for (const card of player.hand) {
    const sym = getTechniqueSymbol(card);
    symbolCounts[sym] = (symbolCounts[sym] || 0) + 1;
  }

  // Check matchability against the obstacle distribution:
  // 8 single-symbol obstacles (2 each of grip, air, agility, balance)
  // 2 dual-symbol "any" obstacles (grip|air, grip|agility)
  const totalObs = 10;
  let totalMatch = 0;

  // Single-symbol: need at least 1 of that symbol in hand
  for (const sym of ['grip', 'air', 'agility', 'balance']) {
    const count = symbolCounts[sym] || 0;
    totalMatch += (count > 0 ? 2 : 0); // 2 obstacles per symbol
  }

  // Dual-symbol "any": need at least 1 of either symbol
  // Rooty Drop: grip | air
  if ((symbolCounts['grip'] || 0) > 0 || (symbolCounts['air'] || 0) > 0) totalMatch++;
  // Slippery Berm: grip | agility
  if ((symbolCounts['grip'] || 0) > 0 || (symbolCounts['agility'] || 0) > 0) totalMatch++;

  return totalMatch / totalObs;
}

// ═══════════════════════════════════════════════════════════
// Action Generation & Evaluation
// ═══════════════════════════════════════════════════════════

interface ScoredAction {
  action: GameAction;
  score: number;
  label: string;
}

/**
 * Generate all legal sprint actions for the current player.
 */
function getLegalActions(state: GameState, playerIndex: number): ScoredAction[] {
  const player = state.players[playerIndex];
  const actions: ScoredAction[] = [];

  if (player.crashed || player.turnEnded || player.actionsRemaining <= 0) {
    return actions;
  }

  // Pedal
  if (!player.cannotPedal) {
    actions.push({ action: { type: 'pedal' }, score: 0, label: 'pedal' });
  }

  // Brake
  if (!player.cannotBrake && player.commitment !== 'pro' && player.momentum > 0) {
    actions.push({ action: { type: 'brake' }, score: 0, label: 'brake' });
  }

  // Steer — enumerate each row that has a token not at the target
  for (let r = 0; r < 6; r++) {
    const col = getTokenCol(player.grid, r);
    if (col >= 0) {
      if (col < 4) {
        actions.push({ action: { type: 'steer', payload: { row: r, direction: 1 } }, score: 0, label: `steer R${r + 1} right` });
      }
      if (col > 0) {
        actions.push({ action: { type: 'steer', payload: { row: r, direction: -1 } }, score: 0, label: `steer R${r + 1} left` });
      }
    }
  }

  // Technique card — each card in hand
  for (let i = 0; i < player.hand.length; i++) {
    actions.push({
      action: { type: 'technique', payload: { cardIndex: i } },
      score: 0,
      label: `play ${getTechniqueName(player.hand[i])} (${getTechniqueSymbol(player.hand[i])})`,
    });
  }

  // Flow spend
  if (player.flow >= 1 && player.hazardDice > 0) {
    actions.push({ action: { type: 'flow_spend', payload: { flowAction: 'reroll' } }, score: 0, label: 'flow: reroll' });
  }
  if (player.flow >= 1) {
    actions.push({ action: { type: 'flow_spend', payload: { flowAction: 'brace' } }, score: 0, label: 'flow: brace' });
  }

  // End turn (always available as a choice)
  actions.push({ action: { type: 'end_turn' }, score: 0, label: 'end turn' });

  return actions;
}

/**
 * Prune obviously bad actions to reduce the number of full state simulations.
 */
function pruneActions(actions: ScoredAction[], state: GameState, playerIndex: number): ScoredAction[] {
  const player = state.players[playerIndex];
  const trail = state.activeTrailCard;

  // Build a set of target lanes for quick lookup
  const targetMap = new Map<number, number>();
  if (trail) {
    const checkedRows = getTrailStageCheckedRows(trail);
    const targetLanes = getTrailStageTargetLanes(trail);
    for (let i = 0; i < checkedRows.length; i++) {
      targetMap.set(checkedRows[i], targetLanes[i]);
    }
  }

  return actions.filter(entry => {
    const a = entry.action;

    // Always keep non-steer/non-brake actions
    if (a.type !== 'steer' && a.type !== 'brake') return true;

    // Brake: skip if momentum <= 1 (almost never useful)
    if (a.type === 'brake' && player.momentum <= 1) return false;

    // Steer: skip moves that go away from target on checked rows
    if (a.type === 'steer' && trail) {
      const row = a.payload?.row as number;
      const dir = a.payload?.direction as number;
      const target = targetMap.get(row);
      if (target !== undefined) {
        const col = getTokenCol(player.grid, row);
        if (col >= 0) {
          const currentDist = Math.abs(col - target);
          const newDist = Math.abs(col + dir - target);
          // Skip if moving further from target (and already close)
          if (newDist > currentDist && currentDist <= 1) return false;
        }
      }
    }

    return true;
  });
}

/**
 * Score each legal action by simulating it and evaluating the resulting state.
 * Returns actions sorted best-first.
 */
function scoreActions(state: GameState, playerIndex: number): ScoredAction[] {
  const allActions = getLegalActions(state, playerIndex);
  const actions = pruneActions(allActions, state, playerIndex);
  const currentScore = evaluateState(state, playerIndex).total;

  for (const entry of actions) {
    if (entry.action.type === 'end_turn') {
      // End turn: no improvement, slight negative to prefer doing useful things
      entry.score = -0.1;
      continue;
    }

    // Simulate the action
    const nextState = processAction(state, playerIndex, entry.action);
    const nextScore = evaluateState(nextState, playerIndex).total;
    entry.score = nextScore - currentScore;
  }

  // Sort best first
  actions.sort((a, b) => b.score - a.score);
  return actions;
}

// ═══════════════════════════════════════════════════════════
// Obstacle Decision Engine
// ═══════════════════════════════════════════════════════════

/**
 * Decide whether using ghost_copy flow to match an otherwise unmatchable
 * obstacle is worth it.
 */
function shouldGhostCopy(
  state: GameState,
  playerIndex: number,
  obstacle: ObstacleType,
): boolean {
  const player = state.players[playerIndex];
  if (player.flow < 1) return false;

  const mode = getObstacleMatchMode(obstacle);
  // Already matchable without ghost copy? Don't spend flow.
  if (canMatchObstacle(player.hand, obstacle)) return false;

  // For 'any' mode: ghost copy doesn't help (it copies an existing symbol).
  if (mode === 'any') return false;

  // 'all' mode: find the missing symbol
  const symbols = getObstacleSymbols(obstacle);
  const symbolsInHand: Record<string, number> = {};
  for (const c of player.hand) {
    const sym = getTechniqueSymbol(c);
    symbolsInHand[sym] = (symbolsInHand[sym] || 0) + 1;
  }

  let missingCount = 0;
  for (const sym of symbols) {
    if ((symbolsInHand[sym] || 0) <= 0) {
      missingCount++;
    } else {
      symbolsInHand[sym]--;
    }
  }

  // Ghost copy can cover exactly 1 missing symbol
  if (missingCount !== 1) return false;
  if (player.hand.length === 0) return false;

  // Worth it? Compare: spend 1 flow to gain shred vs keep flow.
  // Shred is the win condition, so generally worth it.
  const progressGain = player.commitment === 'pro' ? 2 : 1;
  return progressGain * W.shred > W.flow; // almost always true
}

/**
 * Evaluate whether to draw a fresh obstacle (blind) based on:
 * - Current hand composition
 * - Probability of matching a random obstacle
 * - Current hazard dice (blow-by risk)
 * - Round number (urgency)
 */
function shouldDrawFreshObstacle(
  state: GameState,
  playerIndex: number,
  obstaclesAlreadyTackled: number,
): boolean {
  const player = state.players[playerIndex];

  // Don't draw if crashed or turn ended
  if (player.crashed || player.turnEnded) return false;

  // Calculate probability of matching a random obstacle with current hand
  const symbolsInHand: Record<string, number> = { grip: 0, air: 0, agility: 0, balance: 0 };
  for (const c of player.hand) symbolsInHand[getTechniqueSymbol(c)]++;

  // Average match probability across all obstacle types (14 total)
  // 8 single-symbol obstacles: P(match) = P(have at least 1 of that symbol)
  // 2 dual-symbol 'any' obstacles: P(match) = P(have at least 1 of either)
  // 4 hard dual-symbol 'all' obstacles: P(match) = P(have both symbols or wilds)
  let totalMatchProb = 0;
  const syms: CardSymbol[] = ['grip', 'air', 'agility', 'balance'];

  // Single-symbol obstacles (2 each)
  for (const sym of syms) {
    const hasIt = symbolsInHand[sym] > 0 ? 1 : 0;
    totalMatchProb += hasIt * 2; // 2 obstacles of this type
  }

  // Dual-symbol 'any' obstacles (2 total)
  const hasGripOrAir = (symbolsInHand['grip'] > 0 || symbolsInHand['air'] > 0) ? 1 : 0;
  const hasGripOrAgility = (symbolsInHand['grip'] > 0 || symbolsInHand['agility'] > 0) ? 1 : 0;
  totalMatchProb += hasGripOrAir + hasGripOrAgility;

  // Hard dual-symbol 'all' obstacles (4 total): need both symbols (or wilds)
  const hardPairs: [string, string][] = [['air', 'balance'], ['grip', 'agility'], ['balance', 'grip'], ['air', 'agility']];
  for (const [symA, symB] of hardPairs) {
    const hasBoth = (symbolsInHand[symA] > 0 && symbolsInHand[symB] > 0) ? 1 : 0;
    // Also check wild matching: any symbol with 2+ copies can sub for missing
    const canWild = !hasBoth && Object.values(symbolsInHand).some(n => n >= 2) ? 0.5 : 0;
    totalMatchProb += hasBoth || canWild;
  }

  const avgMatchProb = totalMatchProb / 14;

  // Expected value of drawing: P(match) * matchValue + P(miss) * blowByPenalty
  const progressGain = player.commitment === 'pro' ? 2 : 1;
  const matchEV = avgMatchProb * (progressGain * W.shred + 1 * W.momentum);
  const blowByEV = (1 - avgMatchProb) * (W.hazardDice + W.momentum * -1);
  const drawEV = matchEV + blowByEV;

  // Threshold scales with urgency (later rounds = more willing to take risk)
  const roundUrgency = Math.max(0.5, state.round / state.trailLength);

  // First obstacle is almost always worth drawing
  if (obstaclesAlreadyTackled === 0) return drawEV > -2;

  // Additional obstacles: higher bar, scaled by urgency
  const threshold = obstaclesAlreadyTackled === 1 ? 2 : 5;
  return drawEV > threshold / roundUrgency;
}

/**
 * Score a single revealed obstacle for reuse potential.
 * Higher score = better to match with current hand.
 */
function scoreRevealedObstacle(
  obs: ObstacleType,
  hand: TechniqueType[],
): number {
  if (!canMatchObstacle(hand, obs)) return -Infinity;

  const mode = getObstacleMatchMode(obs);
  const symbols = getObstacleSymbols(obs);

  const progressGain = 10; // base value
  let score = progressGain;

  if (mode === 'any') score += 3; // cheaper match (1 card)
  if (symbols.length === 1) score += 2; // single symbol = easiest

  // Check if matching would deplete symbols we need
  const symbolsInHand: Record<string, number> = {};
  for (const c of hand) {
    const sym = getTechniqueSymbol(c);
    symbolsInHand[sym] = (symbolsInHand[sym] || 0) + 1;
  }

  if (mode === 'any') {
    const available = symbols.map(s => symbolsInHand[s] || 0);
    const maxAvailable = Math.max(...available);
    score += maxAvailable * 0.5; // prefer symbols we have plenty of
  } else {
    for (const sym of symbols) {
      const available = symbolsInHand[sym] || 0;
      if (available >= 3) score += 1; // plenty of this symbol
      else if (available <= 1) score -= 2; // using our last copy
    }
  }

  return score;
}

/**
 * Select the best revealed obstacle to reuse.
 * Evaluates per-player obstacle lines and picks the single best matchable obstacle.
 */
function pickBestRevealedObstacle(
  state: GameState,
  playerIndex: number,
): number {
  const player = state.players[playerIndex];
  const revealed = state.roundRevealedObstacles;
  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < revealed.length; i++) {
    const score = scoreRevealedObstacle(revealed[i], player.hand);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

// ═══════════════════════════════════════════════════════════
// Commitment Decision
// ═══════════════════════════════════════════════════════════

/**
 * Decide main vs pro line based on game state.
 * Pro line: +2 shred per obstacle but can't brake, worse blow-by.
 * Worth it when: hand is strong, hazard dice are low, position is behind.
 */
function chooseCommitment(state: GameState, playerIndex: number): 'main' | 'pro' {
  const player = state.players[playerIndex];

  // Calculate obstacle match probability from current deck state
  const symbolCounts: Record<string, number> = { grip: 0, air: 0, agility: 0, balance: 0 };
  for (const c of state.techniqueDeck) symbolCounts[getTechniqueSymbol(c)]++;
  for (const c of state.techniqueDiscard) symbolCounts[getTechniqueSymbol(c)]++;
  // Count cards in all players' hands as part of the pool
  for (const p of state.players) {
    for (const c of p.hand) symbolCounts[getTechniqueSymbol(c)]++;
  }
  const totalCards = Object.values(symbolCounts).reduce((a, b) => a + b, 0);

  const handSize = Math.max(2, Math.min(6, player.momentum));
  const avgMatchProb = pMatchObstacle(['grip'], 'all', handSize, totalCards, symbolCounts);

  // Pro line is worth it when:
  // - High match probability (low blow-by risk)
  // - Low current hazard dice (can absorb some risk)
  // - Behind in shred (need to catch up)
  const avgShred = state.players.reduce((s, p) => s + p.shred, 0) / state.players.length;
  const behind = avgShred - player.shred;

  const proScore =
    avgMatchProb * 2.0 +           // higher match rate = safer pro line
    (player.hazardDice <= 1 ? 1.0 : -1.0) + // low hazard = can risk pro
    (behind > 3 ? 1.5 : 0) +      // behind = need aggression
    (state.round >= 10 ? 1.0 : 0); // late game = need to push

  return proScore > 3.0 ? 'pro' : 'main';
}

// ═══════════════════════════════════════════════════════════
// Main AI Turn Logic
// ═══════════════════════════════════════════════════════════

/**
 * Resolve all active obstacles using smart evaluation.
 */
function resolveObstaclesSmart(state: GameState, playerIndex: number): GameState {
  let s = state;
  while (s.activeObstacles.length > 0 && !s.players[playerIndex].crashed && !s.players[playerIndex].turnEnded) {
    const obs = s.activeObstacles[0];
    const player = s.players[playerIndex];

    // Check if ghost copy would help
    if (!canMatchObstacle(player.hand, obs) && shouldGhostCopy(s, playerIndex, obs)) {
      s = processAction(s, playerIndex, { type: 'flow_spend', payload: { flowAction: 'ghost_copy' } });
      // After ghost copy, treat as matchable
      s = processAction(s, playerIndex, {
        type: 'resolve_obstacle',
        payload: { obstacleIndex: 0 },
      });
      continue;
    }

    if (canMatchObstacle(player.hand, obs)) {
      // Match with cards — shred + deferred momentum
      s = processAction(s, playerIndex, {
        type: 'resolve_obstacle',
        payload: { obstacleIndex: 0 },
      });
    } else {
      // Send It (variable momentum + 1 hazard die) or crash if insufficient
      s = processAction(s, playerIndex, {
        type: 'send_it',
        payload: { obstacleIndex: 0 },
      });
    }
  }
  return s;
}

/**
 * Execute the obstacle phase: reuse revealed obstacles, then draw fresh.
 * Uses probability-based decisions instead of fixed counts.
 */
function obstaclePhase(state: GameState, playerIndex: number): GameState {
  let s = state;
  const p = () => s.players[playerIndex];
  let obstaclesTackled = 0;

  // Phase 1: Reuse revealed obstacles (free, known symbols)
  if (!p().drewFreshObstacle) {
    const maxAttempts = Math.min(s.roundRevealedObstacles.length, 5);
    for (let attempt = 0; attempt < maxAttempts && !p().crashed && !p().turnEnded; attempt++) {
      const bestIdx = pickBestRevealedObstacle(s, playerIndex);
      if (bestIdx < 0) break;

      s = processAction(s, playerIndex, { type: 'reuse_obstacle', payload: { revealedIndex: bestIdx } });
      s = resolveObstaclesSmart(s, playerIndex);
      obstaclesTackled++;
    }
  }

  // Phase 2: Draw fresh obstacles based on probability analysis
  const maxFresh = 3; // hard cap
  for (let i = 0; i < maxFresh && !p().crashed && !p().turnEnded; i++) {
    if (!shouldDrawFreshObstacle(s, playerIndex, obstaclesTackled)) break;

    s = processAction(s, playerIndex, { type: 'draw_obstacle' });
    s = resolveObstaclesSmart(s, playerIndex);
    obstaclesTackled++;
  }

  return s;
}

/**
 * Execute the action phase: spend 5 actions optimally.
 * At each step, enumerate all legal actions, score them,
 * and pick the best one.
 */
function actionPhase(state: GameState, playerIndex: number): GameState {
  let s = state;
  let safety = 25; // prevent infinite loops

  while (s.players[playerIndex].actionsRemaining > 0 &&
         !s.players[playerIndex].crashed &&
         !s.players[playerIndex].turnEnded &&
         safety-- > 0) {

    const scored = scoreActions(s, playerIndex);
    if (scored.length === 0) break;

    const best = scored[0];

    // If the best action is end_turn or has negative EV, stop
    if (best.action.type === 'end_turn' || best.score < -0.5) {
      break;
    }

    s = processAction(s, playerIndex, best.action);
  }

  return s;
}

/**
 * Flow management: spend flow on high-value abilities before/after actions.
 */
function flowManagement(state: GameState, playerIndex: number): GameState {
  let s = state;
  const p = () => s.players[playerIndex];

  // Reroll: clear all hazard dice for 1 flow — extremely valuable at 3+ dice
  if (p().flow >= 1 && p().hazardDice >= 3) {
    s = processAction(s, playerIndex, { type: 'flow_spend', payload: { flowAction: 'reroll' } });
  }

  // Scrub: ignore speed limit for 3 flow — worth it if momentum is significantly over
  const speedLimit = s.activeTrailCard ? getTrailStageSpeedLimit(s.activeTrailCard) : 6;
  if (p().flow >= 3 && p().momentum > speedLimit + 2) {
    s = processAction(s, playerIndex, { type: 'flow_spend', payload: { flowAction: 'scrub' } });
  }

  return s;
}

/**
 * Execute one full smart AI turn during the sprint phase.
 */
export function smartAiPlaySprint(state: GameState, playerIndex: number): GameState {
  let s = state;
  const p = () => s.players[playerIndex];

  if (p().crashed || p().turnEnded) return s;

  // Flow management (pre-actions): clear dangerous hazard dice
  s = flowManagement(s, playerIndex);

  // Obstacle phase: reuse revealed, then draw fresh
  s = obstaclePhase(s, playerIndex);

  // Action phase: evaluate-and-pick loop
  s = actionPhase(s, playerIndex);

  // Flow management (post-actions): clear any accumulated hazard dice
  s = flowManagement(s, playerIndex);

  // End turn
  if (!p().turnEnded) {
    s = processAction(s, playerIndex, { type: 'end_turn' });
  }

  return s;
}

/**
 * Smart AI commitment choice.
 */
export function smartAiCommit(state: GameState, playerIndex: number): GameState {
  const line = chooseCommitment(state, playerIndex);
  return processAction(state, playerIndex, {
    type: 'commit_line',
    payload: { line },
  });
}
