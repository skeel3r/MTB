import {
  GameState, PlayerState, GamePhase, GameAction, CardSymbol, TechniqueType, ObstacleType,
} from './types';
import {
  createTechniqueDeck, createPenaltyDeck, createTrailDeck, createTrailHazards, createObstacleDeck, shuffle,
  getTechniqueSymbol, getTechniqueName, getTechniqueActionText,
  getObstacleName, getObstacleSymbols, getObstacleMatchMode, getObstacleSendItCost, getObstaclePenaltyType, getObstacleBlowByText,
  getPenaltyName, getPenaltyDescription,
  getTrailStageName, getTrailStageSpeedLimit, getTrailStageCheckedRows, getTrailStageTargetLanes,
  getTrailHazardName, getTrailHazardDescription,
  UPGRADE_PROPERTIES, ALL_UPGRADE_TYPES,
  TRAIL_HAZARD_PROPERTIES,
} from './cards';
import type { UpgradeType, TrailHazardType } from './types';

// ── Create initial player state ──
export function createPlayer(id: string, name: string): PlayerState {
  // 5x6 grid, tokens start in column 2 (center) of rows 0-4
  const grid: boolean[][] = Array.from({ length: 6 }, () => Array(5).fill(false));
  for (let row = 0; row < 5; row++) {
    grid[row][2] = true; // center column
  }

  return {
    id,
    name,
    grid,
    momentum: 2,
    flow: 0,
    progress: 0,
    hand: [],
    penalties: [],
    upgrades: [],
    hazardDice: 0,
    actionsRemaining: 5,
    commitment: 'main',
    perfectMatches: 0,
    obstaclesCleared: 0,
    crashed: false,
    turnEnded: false,
    cannotPedal: false,
    cannotBrake: false,
    totalCardsPlayed: 0,
    drewFreshObstacle: false,
    trailReadCommittedPlayer: null,
    trailReadNextIndex: 0,
    pendingMomentum: 0,
  };
}

// ── Initialize game ──
export function initGame(playerNames: string[], trailId?: string): GameState {
  const techniqueDeck = createTechniqueDeck();
  const playerCount = playerNames.length;
  const players = playerNames.map((name, i) => {
    const p = createPlayer(`player-${i}`, name);
    // Earlier players get more starting cards to offset Trail Read disadvantage
    // P1 gets playerCount cards, P2 gets playerCount-1, etc.
    const startingCards = Math.max(1, playerCount - i);
    p.hand = techniqueDeck.splice(0, startingCards);
    return p;
  });

  const trailDeck = createTrailDeck(trailId);
  const trailLength = trailDeck.length;
  const queuedTrailCard = trailDeck.shift()!;

  return {
    players,
    currentPlayerIndex: 0,
    round: 0,
    trailLength,
    trailId: trailId ?? 'whistler-a-line',
    phase: 'setup',
    activeTrailCard: null,
    queuedTrailCard,
    trailDeck,
    techniqueDeck,
    techniqueDiscard: [],
    penaltyDeck: createPenaltyDeck(),
    obstacleDeck: createObstacleDeck(),
    obstacleDiscard: [],
    activeObstacles: [],
    playerObstacleLines: {},
    roundRevealedObstacles: [],
    trailHazards: createTrailHazards(),
    currentHazards: [],
    lastHazardRolls: [],
    log: ['Game initialized. Ready to start!'],
  };
}

// ── Turn order: sort by progress, randomize ties ──
export function sortByProgressRandomTies(players: { i: number; progress: number }[]): { i: number; progress: number }[] {
  // Shuffle first so ties are random (Fisher-Yates)
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  // Stable-ish sort by progress descending (JS sort is stable, so equal-progress players stay shuffled)
  return players.sort((a, b) => b.progress - a.progress);
}

// ── Fast deep clone (avoids JSON.parse/stringify overhead) ──
function clonePlayer(p: PlayerState): PlayerState {
  return {
    id: p.id,
    name: p.name,
    grid: p.grid.map(row => [...row]),
    momentum: p.momentum,
    flow: p.flow,
    progress: p.progress,
    hand: [...p.hand],
    penalties: [...p.penalties],
    upgrades: [...p.upgrades],
    hazardDice: p.hazardDice,
    actionsRemaining: p.actionsRemaining,
    commitment: p.commitment,
    perfectMatches: p.perfectMatches,
    obstaclesCleared: p.obstaclesCleared,
    crashed: p.crashed,
    turnEnded: p.turnEnded,
    cannotPedal: p.cannotPedal,
    cannotBrake: p.cannotBrake,
    totalCardsPlayed: p.totalCardsPlayed,
    drewFreshObstacle: p.drewFreshObstacle,
    trailReadCommittedPlayer: p.trailReadCommittedPlayer,
    trailReadNextIndex: p.trailReadNextIndex,
    pendingMomentum: p.pendingMomentum,
  };
}

function cloneState(state: GameState): GameState {
  const playerObstacleLines: Record<string, ObstacleType[]> = {};
  for (const key in state.playerObstacleLines) {
    playerObstacleLines[key] = [...state.playerObstacleLines[key]];
  }
  return {
    players: state.players.map(clonePlayer),
    currentPlayerIndex: state.currentPlayerIndex,
    round: state.round,
    trailLength: state.trailLength,
    trailId: state.trailId,
    phase: state.phase,
    activeTrailCard: state.activeTrailCard,
    queuedTrailCard: state.queuedTrailCard,
    trailDeck: [...state.trailDeck],
    techniqueDeck: [...state.techniqueDeck],
    techniqueDiscard: [...state.techniqueDiscard],
    penaltyDeck: [...state.penaltyDeck],
    obstacleDeck: [...state.obstacleDeck],
    obstacleDiscard: [...state.obstacleDiscard],
    activeObstacles: [...state.activeObstacles],
    trailHazards: state.trailHazards.map(h => ({ ...h })),
    currentHazards: state.currentHazards.map(h => ({ ...h })),
    playerObstacleLines,
    roundRevealedObstacles: [...state.roundRevealedObstacles],
    lastHazardRolls: state.lastHazardRolls.map(r => ({ ...r, rolls: [...r.rolls] })),
    log: [...state.log],
  };
}

// ── Get token position in a row ──
function getTokenCol(grid: boolean[][], row: number): number {
  for (let c = 0; c < 5; c++) {
    if (grid[row][c]) return c;
  }
  return -1; // no token
}

// ── Set token position ──
function setToken(grid: boolean[][], row: number, col: number): void {
  for (let c = 0; c < 5; c++) grid[row][c] = false;
  const clamped = Math.max(0, Math.min(4, col));
  grid[row][clamped] = true;
}

// ── Trail Read: add obstacle to a player's obstacle line and the shared pool ──
function revealObstacle(state: GameState, playerId: string, obstacle: ObstacleType): void {
  if (!state.playerObstacleLines[playerId]) {
    state.playerObstacleLines[playerId] = [];
  }
  state.playerObstacleLines[playerId].push(obstacle);
  state.roundRevealedObstacles.push(obstacle);
}

// ── Draw a penalty card and apply immediate effects ──
function drawPenalty(state: GameState, player: PlayerState): void {
  if (state.penaltyDeck.length === 0) return;
  const pen = state.penaltyDeck.shift()!;
  player.penalties.push(pen);
  state.log.push(`${player.name}: Drew penalty "${getPenaltyName(pen)}" — ${getPenaltyDescription(pen)}`);

  // Immediate effects
  if (pen === 'slipped_pedal') {
    const discardCount = Math.min(2, player.hand.length);
    for (let i = 0; i < discardCount; i++) {
      const idx = Math.floor(Math.random() * player.hand.length);
      const discarded = player.hand.splice(idx, 1)[0];
      state.techniqueDiscard.push(discarded);
    }
    if (discardCount > 0) {
      state.log.push(`${player.name}: Slipped Pedal — discarded ${discardCount} card${discardCount > 1 ? 's' : ''}.`);
    }
  }

  // Apply flags immediately
  if (pen === 'bent_derailleur') player.cannotPedal = true;
  if (pen === 'snapped_brake') player.cannotBrake = true;
}

// ── Draw cards from technique deck ──
function drawCards(state: GameState, count: number): TechniqueType[] {
  const cards: TechniqueType[] = [];
  for (let i = 0; i < count; i++) {
    if (state.techniqueDeck.length === 0) {
      state.techniqueDeck = shuffle(state.techniqueDiscard);
      state.techniqueDiscard = [];
    }
    if (state.techniqueDeck.length > 0) {
      cards.push(state.techniqueDeck.shift()!);
    }
  }
  return cards;
}

// ── Find obstacle match including "Forced Through" wild matching ──
// Returns card indices to discard, or null if no match possible.
// "Forced Through": any 2 cards of the same symbol can substitute for 1 card of any other symbol.
function findObstacleMatch(
  hand: TechniqueType[],
  obstacle: ObstacleType,
): number[] | null {
  const mode = getObstacleMatchMode(obstacle);
  const symbols = getObstacleSymbols(obstacle);

  if (mode === 'any') {
    // Only need ONE matching symbol — try exact first
    for (const sym of symbols) {
      const idx = hand.findIndex(c => getTechniqueSymbol(c) === sym);
      if (idx >= 0) return [idx];
    }
    // Try wild: any 2 cards of the same symbol
    const symbolGroups: Record<string, number[]> = {};
    for (let i = 0; i < hand.length; i++) {
      const s = getTechniqueSymbol(hand[i]);
      if (!symbolGroups[s]) symbolGroups[s] = [];
      symbolGroups[s].push(i);
    }
    for (const indices of Object.values(symbolGroups)) {
      if (indices.length >= 2) return [indices[0], indices[1]];
    }
    return null;
  }

  // mode === 'all': need every required symbol
  const usedIndices = new Set<number>();
  const matchedIndices: number[] = [];
  const unmatchedSymbols: CardSymbol[] = [];

  // Pass 1: exact matches
  for (const sym of symbols) {
    const idx = hand.findIndex((c, i) => getTechniqueSymbol(c) === sym && !usedIndices.has(i));
    if (idx >= 0) {
      matchedIndices.push(idx);
      usedIndices.add(idx);
    } else {
      unmatchedSymbols.push(sym);
    }
  }

  if (unmatchedSymbols.length === 0) return matchedIndices;

  // Pass 2: "Forced Through" — use 2 same-symbol cards as wild for each unmatched symbol
  for (const _sym of unmatchedSymbols) {
    // Count available cards by symbol (excluding already-used indices)
    const available: Record<string, number[]> = {};
    for (let i = 0; i < hand.length; i++) {
      if (usedIndices.has(i)) continue;
      const s = getTechniqueSymbol(hand[i]);
      if (!available[s]) available[s] = [];
      available[s].push(i);
    }

    // Find any symbol group with 2+ available cards
    let found = false;
    for (const indices of Object.values(available)) {
      if (indices.length >= 2) {
        matchedIndices.push(indices[0], indices[1]);
        usedIndices.add(indices[0]);
        usedIndices.add(indices[1]);
        found = true;
        break;
      }
    }

    if (!found) return null; // Can't match this symbol even with wilds
  }

  return matchedIndices;
}

// ── Get affected rows for a hazard card ──
function getHazardRows(hazardType: TrailHazardType): number[] {
  return TRAIL_HAZARD_PROPERTIES[hazardType].rows;
}

// ── Phase transitions ──
export function advancePhase(state: GameState): GameState {
  const s = cloneState(state);
  const phaseOrder: GamePhase[] = [
    'setup', 'scroll_descent', 'commitment', 'environment',
    'preparation', 'sprint', 'alignment', 'reckoning',
  ];

  const currentIdx = phaseOrder.indexOf(s.phase);

  if (s.phase === 'setup') {
    s.phase = 'scroll_descent';
    return executeScrollDescent(s);
  }

  if (s.phase === 'reckoning') {
    // Check for stage break (every 3 cards)
    // Check for game over (before stage break, so last round skips the shop)
    if (s.round >= s.trailLength) {
      s.phase = 'game_over';
      s.log.push('Game Over!');
      return s;
    }
    // Stage break every 3 rounds (but not the final round)
    if (s.round > 0 && s.round % 3 === 0) {
      s.phase = 'stage_break';
      return executeStageBreak(s);
    }
    // Next round
    s.phase = 'scroll_descent';
    return executeScrollDescent(s);
  }

  if (s.phase === 'stage_break') {
    if (s.round >= s.trailLength) {
      s.phase = 'game_over';
      s.log.push('Game Over!');
      return s;
    }
    s.phase = 'scroll_descent';
    return executeScrollDescent(s);
  }

  if (currentIdx >= 0 && currentIdx < phaseOrder.length - 1) {
    const nextPhase = phaseOrder[currentIdx + 1];
    s.phase = nextPhase;

    switch (nextPhase) {
      case 'commitment':
        s.log.push('Choose your line: Main or Pro.');
        break;
      case 'environment':
        return executeEnvironment(s);
      case 'preparation':
        return executePreparation(s);
      case 'sprint':
        for (const p of s.players) {
          p.actionsRemaining = p.penalties.includes('arm_pump') ? 3 : 5;
          p.crashed = false;
          p.turnEnded = false;
          p.cannotPedal = p.penalties.includes('bent_derailleur');
          p.cannotBrake = p.penalties.includes('snapped_brake');
          p.drewFreshObstacle = false;
          p.trailReadCommittedPlayer = null;
          p.trailReadNextIndex = 0;
          p.pendingMomentum = 0;
        }
        // Turn order: leader goes first (highest progress, random tiebreak)
        {
          const sorted = sortByProgressRandomTies(
            s.players.map((p, i) => ({ i, progress: p.progress }))
          );
          s.currentPlayerIndex = sorted[0].i;
          s.log.push(`Sprint phase! Turn order: ${sorted.map(x => s.players[x.i].name).join(' \u2192 ')} (leader goes first).`);
        }
        break;
      case 'alignment':
        return executeAlignment(s);
      case 'reckoning':
        return executeReckoning(s);
    }
  }

  return s;
}

// ── I. Scroll & Descent ──
function executeScrollDescent(state: GameState): GameState {
  const s = state;
  s.round++;
  s.log.push(`\u2500\u2500 Round ${s.round} \u2500\u2500`);

  // Discard active, move queued to active, flip new queue
  s.activeTrailCard = s.queuedTrailCard;
  s.queuedTrailCard = s.trailDeck.shift() || null;

  if (s.activeTrailCard) {
    s.log.push(`Active Trail: ${getTrailStageName(s.activeTrailCard)} (Speed Limit: ${getTrailStageSpeedLimit(s.activeTrailCard)})`);
  }
  if (s.queuedTrailCard) {
    s.log.push(`Queued: ${getTrailStageName(s.queuedTrailCard)}`);
  }

  // Shift all tokens down 1 row
  for (const player of s.players) {
    const row5col = getTokenCol(player.grid, 4); // Row 5 (index 4) lane
    // Shift down: row[5] = row[4], row[4] = row[3], etc.
    for (let r = 5; r > 0; r--) {
      for (let c = 0; c < 5; c++) {
        player.grid[r][c] = player.grid[r - 1][c];
      }
    }
    // New token enters Row 0 matching previous Row 5 (now Row 6 equivalent)
    for (let c = 0; c < 5; c++) player.grid[0][c] = false;
    setToken(player.grid, 0, row5col >= 0 ? row5col : 2);
  }

  // Clear active obstacles and revealed obstacles from previous round
  s.activeObstacles = [];
  s.roundRevealedObstacles = [];
  s.playerObstacleLines = {};

  s.log.push('All tokens shifted down. New token entered Row 1.');
  return s;
}

// ── III. Environment (Hazards) ──
function executeEnvironment(state: GameState): GameState {
  const s = state;
  s.currentHazards = [];

  // Flip 1 hazard card (affects all listed rows)
  if (s.trailHazards.length === 0) {
    s.trailHazards = createTrailHazards();
  }
  const hazard = s.trailHazards.shift()!;
  s.currentHazards.push(hazard);
  s.log.push(`Hazard: ${getTrailHazardName(hazard.hazardType)} \u2014 ${getTrailHazardDescription(hazard.hazardType)}`);

  // Determine which rows this hazard card affects based on its type
  const hazardRows = getHazardRows(hazard.hazardType);
  for (const player of s.players) {
    for (const row of hazardRows) {
      const col = getTokenCol(player.grid, row);
      if (col < 0) continue;

      let dir: number;
      if (hazard.hazardType === 'brake_bumps') {
        // Toward nearest edge
        dir = col >= 2 ? 1 : -1;
      } else if (hazard.hazardType === 'compression') {
        // Toward center
        dir = col > 2 ? -1 : col < 2 ? 1 : 0;
      } else if (hazard.hazardType === 'loose_dirt') {
        // Random direction
        dir = Math.random() < 0.5 ? -1 : 1;
      } else {
        dir = hazard.pushDirection;
      }

      if (dir !== 0) {
        setToken(player.grid, row, col + dir);
      }
    }
  }

  return s;
}

// ── IV. Preparation ──
function executePreparation(state: GameState): GameState {
  const s = state;

  for (const player of s.players) {
    // Momentum is effectively capped by the trail card speed limit
    // Excess momentum converts to hazard dice (speed trap)
    if (s.activeTrailCard) {
      const speedLimit = getTrailStageSpeedLimit(s.activeTrailCard);
      if (player.momentum > speedLimit) {
        const excess = player.momentum - speedLimit;
        player.hazardDice += excess;
        player.momentum = speedLimit;
        s.log.push(`${player.name}: Speed Trap! Momentum capped to ${speedLimit}, +${excess} Hazard Dice.`);
      }
    }

    const minHand = player.upgrades.includes('carbon_frame') ? 4 : 2;
    const drawCount = Math.max(minHand, Math.min(6, player.momentum));
    const drawn = drawCards(s, drawCount);
    player.hand.push(...drawn);
    s.log.push(`${player.name} draws ${drawn.length} cards (Momentum: ${player.momentum}${minHand > 2 ? ', Carbon Frame min ' + minHand : ''})`);
  }

  return s;
}

// ── VI. Alignment Check ──
function executeAlignment(state: GameState): GameState {
  const s = state;
  if (!s.activeTrailCard) return s;

  const checkedRows = getTrailStageCheckedRows(s.activeTrailCard);
  const targetLanes = getTrailStageTargetLanes(s.activeTrailCard);

  for (const player of s.players) {
    let allPerfect = true;
    let anyPenalty = false;

    for (let i = 0; i < checkedRows.length; i++) {
      const row = checkedRows[i];
      const targetLane = targetLanes[i];
      const playerLane = getTokenCol(player.grid, row);

      if (playerLane < 0) continue;

      const distance = Math.abs(playerLane - targetLane);
      if (distance >= 2) {
        player.hazardDice++;
        anyPenalty = true;
        allPerfect = false;
        s.log.push(`${player.name}: Row ${row + 1} misaligned (${distance} lanes off) \u2192 +1 Hazard Die`);
      } else if (distance > 0) {
        allPerfect = false;
      }
    }

    if (allPerfect && checkedRows.length > 0) {
      player.flow += checkedRows.length;
      player.perfectMatches++;
      s.log.push(`${player.name}: Perfect alignment! +${checkedRows.length} Flow`);
    } else if (!anyPenalty) {
      s.log.push(`${player.name}: Alignment OK (no penalties)`);
    }
  }

  return s;
}

// ── VII. Reckoning ──
function executeReckoning(state: GameState): GameState {
  const s = state;
  s.lastHazardRolls = [];

  for (const player of s.players) {
    if (player.hazardDice <= 0) {
      s.lastHazardRolls.push({ playerName: player.name, rolls: [], penaltyDrawn: null });
      s.log.push(`${player.name}: No hazard dice to roll.`);
      continue;
    }

    const diceCount = Math.min(5, player.hazardDice);
    const rolls: number[] = [];
    let penalty = false;

    for (let i = 0; i < diceCount; i++) {
      const roll = Math.floor(Math.random() * 6) + 1;
      rolls.push(roll);
      if (roll === 6) penalty = true;
    }

    s.log.push(`${player.name} rolls ${diceCount} hazard dice: [${rolls.join(', ')}]`);

    let penaltyDrawn: string | null = null;
    if (penalty) {
      if (s.penaltyDeck.length > 0) {
        const penaltyCard = s.penaltyDeck[0];
        penaltyDrawn = getPenaltyName(penaltyCard);
        drawPenalty(s, player);
      }
    }

    s.lastHazardRolls.push({ playerName: player.name, rolls, penaltyDrawn });

    // Crash check: if accumulated dice were >= 6, crash during reckoning
    if (player.hazardDice >= 6) {
      player.crashed = true;
      // Reset all tokens to center
      for (let r = 0; r < 6; r++) {
        player.grid[r].fill(false);
        player.grid[r][2] = true;
      }
      // Draw an extra penalty card for crashing
      s.log.push(`${player.name}: CRASH! (${player.hazardDice} hazard dice) \u2014 Tokens reset to center.`);
      if (s.penaltyDeck.length > 0) {
        drawPenalty(s, player);
      }
      // Lose momentum on crash
      player.momentum = Math.max(0, player.momentum - 3);
    }

    player.hazardDice = 0;
  }

  return s;
}

// ── Stage Break ──
function executeStageBreak(state: GameState): GameState {
  const s = state;
  s.log.push(`\u2500\u2500 Stage Break (after round ${s.round}) \u2500\u2500`);

  // Sort by progress
  const sorted = [...s.players].sort((a, b) => b.progress - a.progress);
  const last = sorted[sorted.length - 1];

  // Regroup: last place draws 2
  const drawn = drawCards(s, 2);
  const lastPlayer = s.players.find(p => p.id === last.id)!;
  lastPlayer.hand.push(...drawn);
  s.log.push(`Regroup: ${last.name} (last place) draws 2 cards.`);

  // Repair: everyone discards 1 penalty
  for (const player of s.players) {
    if (player.penalties.length > 0) {
      const removed = player.penalties.shift()!;
      s.log.push(`Repair: ${player.name} discards penalty "${getPenaltyName(removed)}".`);
    }
  }

  s.log.push('Shop phase available (spend Flow on upgrades).');
  return s;
}

// ── Process player action during Sprint ──
export function processAction(state: GameState, playerIndex: number, action: GameAction): GameState {
  const s = cloneState(state);
  const player = s.players[playerIndex];

  if (player.crashed || player.turnEnded) {
    s.log.push(`${player.name}: Turn already ended.`);
    return s;
  }

  switch (action.type) {
    case 'pedal': {
      if (player.cannotPedal) {
        s.log.push(`${player.name}: Cannot Pedal (Balance penalty active).`);
        return s;
      }
      // High-Engagement Hubs: 1st pedal/turn costs 0 actions
      const freePedal = player.upgrades.includes('high_engagement_hubs') && player.actionsRemaining === (player.penalties.includes('arm_pump') ? 3 : 5);
      if (!freePedal && player.actionsRemaining < 1) {
        s.log.push(`${player.name}: No actions remaining.`);
        return s;
      }
      if (!freePedal) player.actionsRemaining--;
      else s.log.push(`${player.name}: High-Engagement Hubs — free pedal!`);
      const maxMomentum = player.penalties.includes('dropped_chain') ? 2 : (player.upgrades.includes('carbon_frame') ? 12 : 8);
      player.momentum = Math.min(player.momentum + 1, maxMomentum);
      if (player.momentum >= maxMomentum && player.penalties.includes('dropped_chain')) {
        s.log.push(`${player.name}: Pedal — Momentum capped at ${maxMomentum} (Dropped Chain).`);
      } else {
        s.log.push(`${player.name}: Pedal \u2192 Momentum ${player.momentum}`);
      }
      break;
    }

    case 'brake': {
      if (player.cannotBrake || player.commitment === 'pro') {
        s.log.push(`${player.name}: Cannot Brake${player.commitment === 'pro' ? ' (Pro Line)' : ''}.`);
        return s;
      }
      if (player.actionsRemaining < 1) {
        s.log.push(`${player.name}: No actions remaining.`);
        return s;
      }
      player.actionsRemaining--;
      const brakeDrop = player.upgrades.includes('oversized_rotors') ? 2 : 1;
      player.momentum = Math.max(0, player.momentum - brakeDrop);
      if (brakeDrop > 1) s.log.push(`${player.name}: Oversized Rotors — brake drops momentum by ${brakeDrop}.`);
      s.log.push(`${player.name}: Brake \u2192 Momentum ${player.momentum}`);
      break;
    }

    case 'steer': {
      // Electronic Shifting: 1st steer/turn costs 0 actions
      const freeSteer = player.upgrades.includes('electronic_shifting') && player.actionsRemaining === (player.penalties.includes('arm_pump') ? 3 : 5);
      if (!freeSteer && player.actionsRemaining < 1) {
        s.log.push(`${player.name}: No actions remaining.`);
        return s;
      }
      // Stretched Cable: must discard 1 card to steer
      if (player.penalties.includes('stretched_cable')) {
        if (player.hand.length === 0) {
          s.log.push(`${player.name}: Can't steer — Stretched Cable requires discarding a card, but hand is empty.`);
          return s;
        }
        const discarded = player.hand.pop()!;
        s.techniqueDiscard.push(discarded);
        s.log.push(`${player.name}: Stretched Cable — discarded "${getTechniqueName(discarded)}" to steer.`);
      }
      const row = (action.payload?.row as number) ?? 0;
      const direction = (action.payload?.direction as number) ?? 1;
      const col = getTokenCol(player.grid, row);
      if (col >= 0) {
        setToken(player.grid, row, col + direction);
        if (!freeSteer) player.actionsRemaining--;
        else s.log.push(`${player.name}: Electronic Shifting — free steer!`);
        // Bent Bars: rows 3 and 4 (indices 2,3) move together
        if (player.penalties.includes('bent_bars') && (row === 2 || row === 3)) {
          const linkedRow = row === 2 ? 3 : 2;
          const linkedCol = getTokenCol(player.grid, linkedRow);
          if (linkedCol >= 0) {
            setToken(player.grid, linkedRow, linkedCol + direction);
            s.log.push(`${player.name}: Bent Bars — Row ${linkedRow + 1} moves with Row ${row + 1}.`);
          }
        }
        // Loose Headset: every steer adds +1 hazard die
        if (player.penalties.includes('loose_headset')) {
          player.hazardDice++;
          s.log.push(`${player.name}: Loose Headset — +1 Hazard Die from steering.`);
        }
        // Tacoed Rim: columns 1 and 5 (indices 0,4) add hazard die
        const newCol = getTokenCol(player.grid, row);
        if (player.penalties.includes('tacoed_rim') && (newCol === 0 || newCol === 4)) {
          player.hazardDice++;
          s.log.push(`${player.name}: Tacoed Rim — token on edge column, +1 Hazard Die.`);
        }
        s.log.push(`${player.name}: Steer Row ${row + 1} ${direction > 0 ? 'right' : 'left'}`);
      }
      break;
    }

    case 'technique': {
      if (player.actionsRemaining < 1) {
        s.log.push(`${player.name}: No actions remaining.`);
        return s;
      }
      const cardIndex = (action.payload?.cardIndex as number) ?? 0;
      if (cardIndex < player.hand.length) {
        const card = player.hand.splice(cardIndex, 1)[0];
        player.actionsRemaining--;
        s.log.push(`${player.name}: Plays "${getTechniqueName(card)}" - ${getTechniqueActionText(card)}`);
        s.techniqueDiscard.push(card);

        player.totalCardsPlayed++;

        // ── Apply base technique card effects ──
        switch (card) {
          case 'inside_line':
            // Grip control: ignore grip penalties + shift any 1 token up to 2 lanes
            s.log.push(`${player.name}: Grip penalties ignored this turn.`);
            {
              const targetRow = (action.payload?.targetRow as number) ?? 0;
              const targetDir = (action.payload?.targetDirection as number) ?? 0;
              const targetAmount = Math.min(2, Math.abs(targetDir));
              const col = getTokenCol(player.grid, targetRow);
              if (col >= 0 && targetAmount > 0) {
                const dir = targetDir > 0 ? targetAmount : -targetAmount;
                setToken(player.grid, targetRow, col + dir);
                s.log.push(`${player.name}: Shifted Row ${targetRow + 1} token ${targetAmount} lane${targetAmount > 1 ? 's' : ''} ${targetDir > 0 ? 'right' : 'left'}.`);
              }
            }
            break;
          case 'manual': {
            // Air control: swap any 2 adjacent-row tokens
            const swapRow1 = (action.payload?.swapRow1 as number) ?? 0;
            const swapRow2 = swapRow1 + 1; // must be adjacent
            if (swapRow2 < 6) {
              const col1 = getTokenCol(player.grid, swapRow1);
              const col2 = getTokenCol(player.grid, swapRow2);
              if (col1 >= 0 && col2 >= 0 && col1 !== col2) {
                setToken(player.grid, swapRow1, col2);
                setToken(player.grid, swapRow2, col1);
                s.log.push(`${player.name}: Swapped Row ${swapRow1 + 1} and Row ${swapRow2 + 1} tokens.`);
              } else if (col1 >= 0 && col2 >= 0) {
                s.log.push(`${player.name}: Rows ${swapRow1 + 1} and ${swapRow2 + 1} already aligned \u2014 no swap needed.`);
              }
            }
            break;
          }
          case 'flick': {
            // Agility: shift rows 1-3 (indices 0-2) toward center
            let moved = 0;
            for (const r of [0, 1, 2]) {
              const col = getTokenCol(player.grid, r);
              if (col >= 0) {
                const dir = col > 2 ? -1 : col < 2 ? 1 : 0;
                if (dir !== 0) { setToken(player.grid, r, col + dir); moved++; }
              }
            }
            s.log.push(`${player.name}: Flick \u2014 ${moved} token${moved !== 1 ? 's' : ''} shifted toward center (Rows 1-3).`);
            break;
          }
          case 'recover': {
            // Balance: remove 2 hazard dice (or repair penalty) + center any 1 token
            if (player.hazardDice >= 2) {
              player.hazardDice -= 2;
              s.log.push(`${player.name}: Removed 2 Hazard Dice.`);
            } else if (player.hazardDice === 1) {
              player.hazardDice = 0;
              s.log.push(`${player.name}: Removed 1 Hazard Die.`);
            } else if (player.penalties.length > 0) {
              const removed = player.penalties.pop()!;
              s.log.push(`${player.name}: No dice to remove \u2014 repaired "${getPenaltyName(removed)}" instead!`);
            } else {
              s.log.push(`${player.name}: Nothing to recover \u2014 already clean!`);
            }
            // Center any 1 token (regain composure)
            {
              const centerRow = (action.payload?.centerRow as number) ?? 0;
              const centerCol = getTokenCol(player.grid, centerRow);
              if (centerCol >= 0 && centerCol !== 2) {
                setToken(player.grid, centerRow, 2);
                s.log.push(`${player.name}: Centered Row ${centerRow + 1} token.`);
              }
            }
            break;
          }
          case 'pump': {
            // Air: shift rows 4-6 (indices 3-5) toward center — lower grid complement to Flick
            let moved = 0;
            for (const r of [3, 4, 5]) {
              const col = getTokenCol(player.grid, r);
              if (col >= 0) {
                const dir = col > 2 ? -1 : col < 2 ? 1 : 0;
                if (dir !== 0) { setToken(player.grid, r, col + dir); moved++; }
              }
            }
            s.log.push(`${player.name}: Pump \u2014 ${moved} token${moved !== 1 ? 's' : ''} shifted toward center (Rows 4-6).`);
            break;
          }
          case 'whip': {
            // Grip: move any 1 token directly to any lane — precision placement
            const whipRow = (action.payload?.targetRow as number) ?? 0;
            const whipLane = (action.payload?.targetLane as number) ?? 2;
            const clampedLane = Math.max(0, Math.min(4, whipLane));
            if (whipRow >= 0 && whipRow < 6) {
              setToken(player.grid, whipRow, clampedLane);
              s.log.push(`${player.name}: Whip \u2014 placed Row ${whipRow + 1} token on lane ${clampedLane + 1}.`);
            }
            break;
          }
        }

      }
      break;
    }

    case 'tackle': {
      // Legacy action — redirects to resolve_obstacle with auto-detect
      const obstacleIndex = (action.payload?.obstacleIndex as number) ?? 0;
      if (obstacleIndex >= s.activeObstacles.length) break;
      const obstacle = s.activeObstacles[obstacleIndex];
      const matchCardIndices = findObstacleMatch(player.hand, obstacle);
      if (matchCardIndices) {
        return processAction(s, playerIndex, { type: 'resolve_obstacle', payload: { obstacleIndex } });
      } else {
        return processAction(s, playerIndex, { type: 'send_it', payload: { obstacleIndex } });
      }
    }

    case 'commit_line': {
      const line = (action.payload?.line as string) ?? 'main';
      player.commitment = line as 'main' | 'pro';
      if (line === 'pro') {
        player.cannotBrake = true;
      }
      s.log.push(`${player.name}: Commits to ${line === 'pro' ? 'Pro' : 'Main'} Line`);
      break;
    }

    case 'flow_spend': {
      const flowAction = action.payload?.flowAction as string;
      switch (flowAction) {
        case 'reroll':
          if (player.flow >= 1) {
            player.flow--;
            player.hazardDice = 0; // simplified: reroll effectively clears
            s.log.push(`${player.name}: Spent 1 Flow \u2192 Reroll hazard dice`);
          }
          break;
        case 'brace':
          if (player.flow >= 1) {
            player.flow--;
            s.log.push(`${player.name}: Spent 1 Flow \u2192 Brace (ignore 1 hazard push)`);
          }
          break;
        case 'ghost_copy':
          if (player.penalties.includes('blown_seals')) {
            s.log.push(`${player.name}: Blown Seals — cannot use Ghost Copy.`);
            break;
          }
          if (player.flow >= 1) {
            player.flow--;
            s.log.push(`${player.name}: Spent 1 Flow \u2192 Ghost Copy (duplicate symbol)`);
          }
          break;
        case 'scrub':
          if (player.flow >= 3) {
            player.flow -= 3;
            s.log.push(`${player.name}: Spent 3 Flow \u2192 Scrub (ignore speed limit)`);
          }
          break;
      }
      break;
    }

    case 'buy_upgrade': {
      const upgrade = action.payload?.upgrade as UpgradeType | undefined;
      if (!upgrade) break;
      const props = UPGRADE_PROPERTIES[upgrade];
      if (!props) break;
      if (player.upgrades.includes(upgrade)) {
        s.log.push(`${player.name}: Already owns "${props.name}".`);
        break;
      }
      if (player.flow < props.flowCost) {
        s.log.push(`${player.name}: Not enough Flow for "${props.name}" (need ${props.flowCost}, have ${player.flow}).`);
        break;
      }
      player.flow -= props.flowCost;
      player.upgrades.push(upgrade);
      s.log.push(`${player.name}: Purchased "${props.name}" for ${props.flowCost} Flow!`);
      break;
    }

    case 'draw_obstacle': {
      // Free action - flip an obstacle from the deck (draws blind)
      // Trail Read: drawing fresh locks the player out of the revealed obstacle pool
      player.drewFreshObstacle = true;

      if (s.obstacleDeck.length === 0) {
        // Reshuffle discard pile back into deck
        if (s.obstacleDiscard.length > 0) {
          s.obstacleDeck = shuffle([...s.obstacleDiscard]);
          s.obstacleDiscard = [];
          s.log.push('Obstacle discard pile reshuffled into a new deck.');
        } else {
          s.obstacleDeck = createObstacleDeck();
          s.log.push('New obstacle deck created.');
        }
      }
      const drawn = s.obstacleDeck.shift()!;
      s.activeObstacles.push(drawn);
      s.log.push(`${player.name}: Flipped obstacle "${getObstacleName(drawn)}" (${getObstacleSymbols(drawn).join(', ')})`);
      break;
    }

    case 'reuse_obstacle': {
      // Trail Read: tackle an obstacle already revealed by a player ahead.
      // Rules:
      //   1. Can't reuse if player already drew a fresh obstacle this turn
      //   2. Once committed to a player's line, must continue in order (can't switch)
      //   3. Must resolve obstacles in the same order the original player resolved them
      //   4. payload.targetPlayerId picks which player's line to follow (required if uncommitted)

      if (player.drewFreshObstacle) {
        s.log.push(`${player.name}: Already drew a fresh obstacle — can't reuse revealed obstacles.`);
        break;
      }

      const targetPlayerId = action.payload?.targetPlayerId as string | undefined;

      // Determine which player's line to use
      let committedPid = player.trailReadCommittedPlayer;

      if (!committedPid) {
        // Not yet committed — must specify which player's line
        if (!targetPlayerId || !s.playerObstacleLines[targetPlayerId]) {
          s.log.push(`${player.name}: Must specify a valid player line to follow.`);
          break;
        }
        // Can't follow your own line
        if (targetPlayerId === player.id) {
          s.log.push(`${player.name}: Can't reuse your own obstacle line.`);
          break;
        }
        committedPid = targetPlayerId;
        player.trailReadCommittedPlayer = committedPid;
        player.trailReadNextIndex = 0;
      } else if (targetPlayerId && targetPlayerId !== committedPid) {
        // Trying to switch lines — not allowed
        const committedPlayer = s.players.find(p => p.id === committedPid);
        s.log.push(`${player.name}: Already committed to ${committedPlayer?.name ?? committedPid}'s obstacle line — can't switch.`);
        break;
      }

      const line = s.playerObstacleLines[committedPid];
      if (!line || player.trailReadNextIndex >= line.length) {
        const committedPlayer = s.players.find(p => p.id === committedPid);
        s.log.push(`${player.name}: No more obstacles in ${committedPlayer?.name ?? committedPid}'s line.`);
        break;
      }

      // Must take the next obstacle in order
      const reused = line[player.trailReadNextIndex];
      player.trailReadNextIndex++;

      s.activeObstacles.push(reused);
      const committedPlayerName = s.players.find(p => p.id === committedPid)?.name ?? committedPid;
      s.log.push(`${player.name}: Trail Read — tackles "${getObstacleName(reused)}" (#${player.trailReadNextIndex} in ${committedPlayerName}'s line)`);
      break;
    }

    case 'resolve_obstacle': {
      // Match an obstacle with cards. Terrain effect always fires.
      // Momentum earned is DEFERRED to end of turn.
      // If player can't match, they must Send It (2 momentum) or crash.
      const obstacleIndex = (action.payload?.obstacleIndex as number) ?? 0;
      if (obstacleIndex >= s.activeObstacles.length) break;
      const obstacle = s.activeObstacles[obstacleIndex];

      // Flat Tire: must spend 2 momentum to tackle any obstacle
      if (player.penalties.includes('flat_tire')) {
        if (player.momentum < 2) {
          s.log.push(`${player.name}: Flat Tire — need 2 momentum to tackle obstacles (have ${player.momentum}).`);
          break;
        }
        player.momentum -= 2;
        s.log.push(`${player.name}: Flat Tire — spent 2 momentum to tackle obstacle.`);
      }

      // Step 1: Terrain effect ALWAYS fires
      s.log.push(`${player.name}: Hits "${getObstacleName(obstacle)}" \u2014 ${getObstacleBlowByText(obstacle)}`);
      applyObstaclePenalty(player, obstacle, s);

      // Step 2: Try to match with cards
      const matchCardIndices = findObstacleMatch(player.hand, obstacle);

      if (matchCardIndices) {
        const symbols = getObstacleSymbols(obstacle);
        const usedWilds = matchCardIndices.length > symbols.length ||
          (getObstacleMatchMode(obstacle) === 'any' && matchCardIndices.length > 1);

        const sortedIndices = [...matchCardIndices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          const matchCard = player.hand.splice(idx, 1)[0];
          s.techniqueDiscard.push(matchCard);
        }
        const resolveProgressGain = player.commitment === 'pro' ? 2 : 1;
        player.progress += resolveProgressGain;
        player.pendingMomentum++; // Deferred — applied at end of turn
        player.obstaclesCleared++;
        // Factory Suspension: Pro Line obstacle clears gain +2 Flow
        if (player.commitment === 'pro' && player.upgrades.includes('factory_suspension')) {
          player.flow += 2;
          s.log.push(`${player.name}: Factory Suspension — +2 Flow from Pro Line clear!`);
        }
        const wildNote = usedWilds ? ' (Forced Through!)' : '';
        s.log.push(`${player.name}: Matched "${getObstacleName(obstacle)}"${wildNote}! +${resolveProgressGain} Progress, +1 Pending Momentum (${player.obstaclesCleared} cleared)`);
      } else {
        // Can't match — this shouldn't happen if UI is correct (should use send_it instead)
        // Force crash
        s.log.push(`${player.name}: Cannot match "${getObstacleName(obstacle)}" and no momentum \u2014 CRASH!`);
        player.crashed = true;
        player.turnEnded = true;
        for (let r = 0; r < 6; r++) setToken(player.grid, r, 2);
        player.momentum = Math.max(0, player.momentum - 3);
        if (s.penaltyDeck.length > 0) {
          drawPenalty(s, player);
          s.log.push(`${player.name}: Drew penalty card from crash.`);
        }
      }

      s.activeObstacles.splice(obstacleIndex, 1);
      revealObstacle(s, player.id, obstacle);
      s.obstacleDiscard.push(obstacle);

      // Crash check from terrain effect accumulating hazard dice
      if (!player.crashed && player.hazardDice >= 6) {
        player.crashed = true;
        player.turnEnded = true;
        for (let r = 0; r < 6; r++) setToken(player.grid, r, 2);
        if (s.penaltyDeck.length > 0) {
          drawPenalty(s, player);
        }
        player.momentum = Math.max(0, player.momentum - 3);
        s.log.push(`${player.name}: CRASH from hazard dice! Reset to center, penalty card drawn.`);
      }
      break;
    }

    case 'send_it': {
      // "Send It" / Blow-By — spend momentum + 1 Hazard Die to clear obstacle without cards
      // Cost is obstacle.sendItCost (default 2). Hard obstacles cost 3.
      // Terrain effect always fires. If momentum < cost, player must crash.
      const sendObstacleIdx = (action.payload?.obstacleIndex as number) ?? 0;
      if (sendObstacleIdx >= s.activeObstacles.length) {
        s.log.push(`${player.name}: No active obstacle to Send It through.`);
        break;
      }
      const sendCost = getObstacleSendItCost(s.activeObstacles[sendObstacleIdx]);
      if (player.momentum < sendCost) {
        // Can't send it — force crash
        const crashObs = s.activeObstacles[sendObstacleIdx];
        s.log.push(`${player.name}: Hits "${getObstacleName(crashObs)}" \u2014 ${getObstacleBlowByText(crashObs)}`);
        applyObstaclePenalty(player, crashObs, s);
        s.log.push(`${player.name}: Can't match or Send It \u2014 CRASH!`);
        player.crashed = true;
        player.turnEnded = true;
        for (let r = 0; r < 6; r++) setToken(player.grid, r, 2);
        player.momentum = Math.max(0, player.momentum - 3);
        if (s.penaltyDeck.length > 0) {
          drawPenalty(s, player);
          s.log.push(`${player.name}: Drew penalty card from crash.`);
        }
        s.activeObstacles.splice(sendObstacleIdx, 1);
        revealObstacle(s, player.id, crashObs);
        s.obstacleDiscard.push(crashObs);
        break;
      }

      const sentObstacle = s.activeObstacles[sendObstacleIdx];

      // Step 1: Terrain effect ALWAYS fires
      s.log.push(`${player.name}: Hits "${getObstacleName(sentObstacle)}" \u2014 ${getObstacleBlowByText(sentObstacle)}`);
      applyObstaclePenalty(player, sentObstacle, s);

      // Step 2: Pay momentum cost + hazard die, earn progress
      const thisSendCost = getObstacleSendItCost(sentObstacle);
      player.momentum -= thisSendCost;
      player.hazardDice++;

      // Pro Line blow-by: extra +1 hazard die and draw a penalty card
      if (player.commitment === 'pro') {
        player.hazardDice++;
        if (s.penaltyDeck.length > 0) {
          drawPenalty(s, player);
        }
      }

      const sendProgressGain = player.commitment === 'pro' ? 2 : 1;
      player.progress += sendProgressGain;
      player.obstaclesCleared++;
      const hazardText = player.commitment === 'pro' ? '+2 Hazard Dice + Penalty' : '+1 Hazard Die';
      s.log.push(`${player.name}: SENDS IT through "${getObstacleName(sentObstacle)}"! -${thisSendCost} Momentum, ${hazardText}, +${sendProgressGain} Progress (${player.obstaclesCleared} cleared)`);

      s.activeObstacles.splice(sendObstacleIdx, 1);
      revealObstacle(s, player.id, sentObstacle);
      s.obstacleDiscard.push(sentObstacle);

      // Crash check from accumulated hazard dice
      if (player.hazardDice >= 6) {
        player.crashed = true;
        player.turnEnded = true;
        for (let r = 0; r < 6; r++) setToken(player.grid, r, 2);
        player.momentum = Math.max(0, player.momentum - 3);
        if (s.penaltyDeck.length > 0) {
          drawPenalty(s, player);
        }
        s.log.push(`${player.name}: CRASH from hazard dice! Reset to center, penalty card drawn.`);
      }
      break;
    }

    case 'end_turn': {
      player.turnEnded = true;

      // Apply deferred momentum from obstacle matches
      if (player.pendingMomentum > 0) {
        player.momentum = Math.min(player.momentum + player.pendingMomentum, 12);
        s.log.push(`${player.name}: +${player.pendingMomentum} deferred Momentum from obstacles \u2192 Momentum ${player.momentum}`);
        player.pendingMomentum = 0;
      }

      s.log.push(`${player.name}: Ends turn.`);

      // Move to next player in standings order (highest progress first)
      const turnOrder = [...s.players]
        .map((p, i) => ({ i, progress: p.progress }))
        .sort((a, b) => b.progress - a.progress);
      const currentOrderIdx = turnOrder.findIndex(x => x.i === playerIndex);
      if (currentOrderIdx < turnOrder.length - 1) {
        s.currentPlayerIndex = turnOrder[currentOrderIdx + 1].i;
      }
      break;
    }
  }

  return s;
}

// ── Obstacle Blow-By Penalties ──
function applyObstaclePenalty(player: PlayerState, obstacle: ObstacleType, state: GameState): void {
  const penaltyType = getObstaclePenaltyType(obstacle);
  switch (penaltyType) {
    case 'Slide Out': {
      // Row 1 token shifts 2 lanes randomly
      const col = getTokenCol(player.grid, 0);
      if (col >= 0) {
        const dir = Math.random() < 0.5 ? -2 : 2;
        setToken(player.grid, 0, col + dir);
      }
      break;
    }
    case 'Heavy Drag': {
      // Lose 2 Momentum and 1 card from hand
      player.momentum = Math.max(0, player.momentum - 2);
      if (player.hand.length > 0) {
        const discardIdx = Math.floor(Math.random() * player.hand.length);
        const discarded = player.hand.splice(discardIdx, 1)[0];
        state.techniqueDiscard.push(discarded);
      }
      break;
    }
    case 'Case It': {
      // Lose 2 Momentum immediately
      player.momentum = Math.max(0, player.momentum - 2);
      break;
    }
    case 'Bottom Out': {
      // Take 2 Hazard Dice instead of the normal 1 (1 already added, add 1 more)
      player.hazardDice++;
      break;
    }
    case 'Wide Turn': {
      // Row 1 shifts 1 lane away from center
      const col = getTokenCol(player.grid, 0);
      if (col >= 0) {
        const dir = col >= 2 ? 1 : -1;
        setToken(player.grid, 0, col + dir);
      }
      break;
    }
    case 'Whiplash': {
      // Shift Row 2 and Row 3 one lane right
      for (const r of [1, 2]) {
        const col = getTokenCol(player.grid, r);
        if (col >= 0) setToken(player.grid, r, col + 1);
      }
      break;
    }
    case 'Stall': {
      // Cannot Pedal or use Momentum this turn
      player.cannotPedal = true;
      break;
    }
    case 'Locked': {
      // Row 1 token cannot move next turn (simplified: shift to center)
      setToken(player.grid, 0, 2);
      break;
    }
    case 'Wipeout': {
      // Take 2 Hazard Dice and end turn immediately (1 already added, add 1 more)
      player.hazardDice++;
      player.turnEnded = true;
      break;
    }
    case 'Wash Out': {
      // Shift Row 1 and Row 2 three lanes (random direction)
      const dir = Math.random() < 0.5 ? -3 : 3;
      for (const r of [0, 1]) {
        const col = getTokenCol(player.grid, r);
        if (col >= 0) setToken(player.grid, r, col + dir);
      }
      break;
    }
  }
}

// ── Get game winner ──
export function getWinner(state: GameState): PlayerState | null {
  if (state.phase !== 'game_over') return null;

  const sorted = [...state.players].sort((a, b) => {
    // Most progress first
    if (b.progress !== a.progress) return b.progress - a.progress;
    // Perfect matches
    if (b.perfectMatches !== a.perfectMatches) return b.perfectMatches - a.perfectMatches;
    // Least penalties
    if (a.penalties.length !== b.penalties.length) return a.penalties.length - b.penalties.length;
    // Most flow
    if (b.flow !== a.flow) return b.flow - a.flow;
    // Max momentum
    return b.momentum - a.momentum;
  });

  return sorted[0];
}

// ── Get standings ──
export function getStandings(state: GameState) {
  return [...state.players]
    .sort((a, b) => {
      // Primary: most obstacles cleared wins
      if (b.obstaclesCleared !== a.obstaclesCleared) return b.obstaclesCleared - a.obstaclesCleared;
      if (b.progress !== a.progress) return b.progress - a.progress;
      if (b.perfectMatches !== a.perfectMatches) return b.perfectMatches - a.perfectMatches;
      if (a.penalties.length !== b.penalties.length) return a.penalties.length - b.penalties.length;
      if (b.flow !== a.flow) return b.flow - a.flow;
      return b.momentum - a.momentum;
    })
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      progress: p.progress,
      obstaclesCleared: p.obstaclesCleared,
      perfectMatches: p.perfectMatches,
      penalties: p.penalties.length,
      flow: p.flow,
      momentum: p.momentum,
      totalCardsPlayed: p.totalCardsPlayed,
    }));
}
