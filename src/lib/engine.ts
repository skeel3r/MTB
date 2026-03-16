import {
  GameState, PlayerState, GamePhase, GameAction, CardSymbol, TechniqueCard, ProgressObstacle,
} from './types';
import {
  createTechniqueDeck, createPenaltyDeck, createTrailDeck, createTrailHazards, createObstacleDeck, shuffle, UPGRADES, OBSTACLE_DEFINITIONS,
} from './cards';

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
    cardsPlayedThisTurn: [],
    combosTriggered: [],
    totalCardsPlayed: 0,
    totalCombos: 0,
    drewFreshObstacle: false,
    pendingMomentum: 0,
  };
}

// ── Initialize game ──
export function initGame(playerNames: string[], trailId?: string): GameState {
  const techniqueDeck = createTechniqueDeck();
  const players = playerNames.map((name, i) => {
    const p = createPlayer(`player-${i}`, name);
    // Draw 2 initial cards
    p.hand = techniqueDeck.splice(0, 2);
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

// ── Deep clone helper ──
function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
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
function revealObstacle(state: GameState, playerId: string, obstacle: ProgressObstacle): void {
  if (!state.playerObstacleLines[playerId]) {
    state.playerObstacleLines[playerId] = [];
  }
  state.playerObstacleLines[playerId].push({ ...obstacle });
  state.roundRevealedObstacles.push({ ...obstacle });
}

// ── Draw cards from technique deck ──
function drawCards(state: GameState, count: number): TechniqueCard[] {
  const cards: TechniqueCard[] = [];
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
  hand: TechniqueCard[],
  obstacle: ProgressObstacle,
): number[] | null {
  const mode = obstacle.matchMode ?? 'all';

  if (mode === 'any') {
    // Only need ONE matching symbol — try exact first
    for (const sym of obstacle.symbols) {
      const idx = hand.findIndex(c => c.symbol === sym);
      if (idx >= 0) return [idx];
    }
    // Try wild: any 2 cards of the same symbol
    const symbolGroups: Record<string, number[]> = {};
    for (let i = 0; i < hand.length; i++) {
      const s = hand[i].symbol;
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
  for (const sym of obstacle.symbols) {
    const idx = hand.findIndex((c, i) => c.symbol === sym && !usedIndices.has(i));
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
      const s = hand[i].symbol;
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
function getHazardRows(hazardName: string): number[] {
  switch (hazardName) {
    case 'Camber Left':
    case 'Camber Right':
      return [0, 1, 2]; // Rows 1-3
    case 'Brake Bumps':
      return [0, 1]; // Rows 1-2
    case 'Compression':
      return [2, 3]; // Rows 3-4
    case 'Loose Dirt':
      return [4, 5]; // Rows 5-6
    default:
      return [0];
  }
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
    if (s.round > 0 && s.round % 3 === 0) {
      s.phase = 'stage_break';
      return executeStageBreak(s);
    }
    // Check for game over
    if (s.round >= s.trailLength) {
      s.phase = 'game_over';
      s.log.push('Game Over!');
      return s;
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
          p.actionsRemaining = 5;
          p.crashed = false;
          p.turnEnded = false;
          p.cannotPedal = false;
          p.cannotBrake = false;
          p.cardsPlayedThisTurn = [];
          p.combosTriggered = [];
          p.drewFreshObstacle = false;
          p.pendingMomentum = 0;
        }
        // Turn order: leader goes first (highest progress)
        {
          const sorted = [...s.players]
            .map((p, i) => ({ i, progress: p.progress }))
            .sort((a, b) => b.progress - a.progress); // highest progress first
          s.currentPlayerIndex = sorted[0].i;
          s.log.push(`Sprint phase! Turn order: ${sorted.map(x => s.players[x.i].name).join(' → ')} (leader goes first).`);
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
  s.log.push(`── Round ${s.round} ──`);

  // Discard active, move queued to active, flip new queue
  s.activeTrailCard = s.queuedTrailCard;
  s.queuedTrailCard = s.trailDeck.shift() || null;

  s.log.push(`Active Trail: ${s.activeTrailCard?.name} (Speed Limit: ${s.activeTrailCard?.speedLimit})`);
  if (s.queuedTrailCard) {
    s.log.push(`Queued: ${s.queuedTrailCard.name}`);
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
  s.log.push(`Hazard: ${hazard.name} — ${hazard.description}`);

  // Determine which rows this hazard card affects based on its name
  const hazardRows = getHazardRows(hazard.name);
  for (const player of s.players) {
    for (const row of hazardRows) {
      const col = getTokenCol(player.grid, row);
      if (col < 0) continue;

      let dir: number;
      if (hazard.name === 'Brake Bumps') {
        // Toward nearest edge
        dir = col >= 2 ? 1 : -1;
      } else if (hazard.name === 'Compression') {
        // Toward center
        dir = col > 2 ? -1 : col < 2 ? 1 : 0;
      } else if (hazard.name === 'Loose Dirt') {
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
    if (s.activeTrailCard && player.momentum > s.activeTrailCard.speedLimit) {
      const excess = player.momentum - s.activeTrailCard.speedLimit;
      player.hazardDice += excess;
      player.momentum = s.activeTrailCard.speedLimit;
      s.log.push(`${player.name}: Speed Trap! Momentum capped to ${s.activeTrailCard.speedLimit}, +${excess} Hazard Dice.`);
    }

    const drawCount = Math.max(2, Math.min(6, player.momentum));
    const drawn = drawCards(s, drawCount);
    player.hand.push(...drawn);
    s.log.push(`${player.name} draws ${drawn.length} cards (Momentum: ${player.momentum})`);
  }

  return s;
}

// ── VI. Alignment Check ──
function executeAlignment(state: GameState): GameState {
  const s = state;
  if (!s.activeTrailCard) return s;

  const card = s.activeTrailCard;

  for (const player of s.players) {
    let allPerfect = true;
    let anyPenalty = false;

    for (let i = 0; i < card.checkedRows.length; i++) {
      const row = card.checkedRows[i];
      const targetLane = card.targetLanes[i];
      const playerLane = getTokenCol(player.grid, row);

      if (playerLane < 0) continue;

      const distance = Math.abs(playerLane - targetLane);
      if (distance >= 2) {
        player.hazardDice++;
        anyPenalty = true;
        allPerfect = false;
        s.log.push(`${player.name}: Row ${row + 1} misaligned (${distance} lanes off) → +1 Hazard Die`);
      } else if (distance > 0) {
        allPerfect = false;
      }
    }

    if (allPerfect && card.checkedRows.length > 0) {
      player.flow++;
      player.perfectMatches++;
      s.log.push(`${player.name}: Perfect alignment! +1 Flow`);
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
        const penaltyCard = s.penaltyDeck.shift()!;
        player.penalties.push(penaltyCard);
        penaltyDrawn = penaltyCard.name;
        s.log.push(`${player.name}: Rolled a 6! Penalty: ${penaltyCard.name} - ${penaltyCard.description}`);
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
      if (s.penaltyDeck.length > 0) {
        const crashPen = s.penaltyDeck.shift()!;
        player.penalties.push(crashPen);
        s.log.push(`${player.name}: CRASH! (${player.hazardDice} hazard dice) — Tokens reset, penalty: ${crashPen.name}`);
      } else {
        s.log.push(`${player.name}: CRASH! (${player.hazardDice} hazard dice) — Tokens reset to center.`);
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
  s.log.push(`── Stage Break (after round ${s.round}) ──`);

  // Sort by progress
  const sorted = [...s.players].sort((a, b) => b.progress - a.progress);
  const leader = sorted[0];
  const last = sorted[sorted.length - 1];

  // Regroup: last place draws 2
  const drawn = drawCards(s, 2);
  const lastPlayer = s.players.find(p => p.id === last.id)!;
  lastPlayer.hand.push(...drawn);
  s.log.push(`Regroup: ${last.name} (last place) draws 2 cards.`);

  // Flow: last place gains 1 (catch-up mechanic — leader already has positional advantage)
  lastPlayer.flow++;
  s.log.push(`Flow: ${last.name} (last place) gains 1 Flow.`);

  // Repair: everyone discards 1 penalty
  for (const player of s.players) {
    if (player.penalties.length > 0) {
      const removed = player.penalties.shift()!;
      s.log.push(`Repair: ${player.name} discards penalty "${removed.name}".`);
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
      if (player.actionsRemaining < 1) {
        s.log.push(`${player.name}: No actions remaining.`);
        return s;
      }
      player.actionsRemaining--;
      player.momentum++;
      s.log.push(`${player.name}: Pedal → Momentum ${player.momentum}`);
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
      player.momentum = Math.max(0, player.momentum - 1);
      s.log.push(`${player.name}: Brake → Momentum ${player.momentum}`);
      break;
    }

    case 'steer': {
      if (player.actionsRemaining < 1) {
        s.log.push(`${player.name}: No actions remaining.`);
        return s;
      }
      const row = (action.payload?.row as number) ?? 0;
      const direction = (action.payload?.direction as number) ?? 1;
      const col = getTokenCol(player.grid, row);
      if (col >= 0) {
        setToken(player.grid, row, col + direction);
        player.actionsRemaining--;
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
        s.log.push(`${player.name}: Plays "${card.name}" - ${card.actionText}`);
        s.techniqueDiscard.push(card);

        // Track for combo system
        player.cardsPlayedThisTurn.push({ symbol: card.symbol, name: card.name });
        player.totalCardsPlayed++;
        const playCount = player.cardsPlayedThisTurn.length;
        const sameSymbolCount = player.cardsPlayedThisTurn.filter(c => c.symbol === card.symbol).length;
        const uniqueSymbols = new Set(player.cardsPlayedThisTurn.map(c => c.symbol)).size;

        // ── Apply base technique card effects ──
        switch (card.name) {
          case 'Inside Line':
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
          case 'Manual': {
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
                s.log.push(`${player.name}: Rows ${swapRow1 + 1} and ${swapRow2 + 1} already aligned — no swap needed.`);
              }
            }
            break;
          }
          case 'Flick': {
            // Agility: shift rows 1-3 (indices 0-2) toward center
            let moved = 0;
            for (const r of [0, 1, 2]) {
              const col = getTokenCol(player.grid, r);
              if (col >= 0) {
                const dir = col > 2 ? -1 : col < 2 ? 1 : 0;
                if (dir !== 0) { setToken(player.grid, r, col + dir); moved++; }
              }
            }
            s.log.push(`${player.name}: Flick — ${moved} token${moved !== 1 ? 's' : ''} shifted toward center (Rows 1-3).`);
            break;
          }
          case 'Recover': {
            // Balance: remove 2 hazard dice (or repair penalty) + center any 1 token
            if (player.hazardDice >= 2) {
              player.hazardDice -= 2;
              s.log.push(`${player.name}: Removed 2 Hazard Dice.`);
            } else if (player.hazardDice === 1) {
              player.hazardDice = 0;
              s.log.push(`${player.name}: Removed 1 Hazard Die.`);
            } else if (player.penalties.length > 0) {
              const removed = player.penalties.pop()!;
              s.log.push(`${player.name}: No dice to remove — repaired "${removed.name}" instead!`);
            } else {
              s.log.push(`${player.name}: Nothing to recover — already clean!`);
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
          case 'Pump': {
            // Air: shift rows 4-6 (indices 3-5) toward center — lower grid complement to Flick
            let moved = 0;
            for (const r of [3, 4, 5]) {
              const col = getTokenCol(player.grid, r);
              if (col >= 0) {
                const dir = col > 2 ? -1 : col < 2 ? 1 : 0;
                if (dir !== 0) { setToken(player.grid, r, col + dir); moved++; }
              }
            }
            s.log.push(`${player.name}: Pump — ${moved} token${moved !== 1 ? 's' : ''} shifted toward center (Rows 4-6).`);
            break;
          }
          case 'Whip': {
            // Grip: move any 1 token directly to any lane — precision placement
            const whipRow = (action.payload?.targetRow as number) ?? 0;
            const whipLane = (action.payload?.targetLane as number) ?? 2;
            const clampedLane = Math.max(0, Math.min(4, whipLane));
            if (whipRow >= 0 && whipRow < 6) {
              setToken(player.grid, whipRow, clampedLane);
              s.log.push(`${player.name}: Whip — placed Row ${whipRow + 1} token on lane ${clampedLane + 1}.`);
            }
            break;
          }
        }

        // ── Combo Detection ──

        // SYNERGY: 2+ cards of same symbol = amplified effect
        if (sameSymbolCount === 2) {
          player.combosTriggered.push(`Synergy: ${card.symbol}`);
          player.totalCombos++;
          switch (card.symbol) {
            case 'grip':
              // Double grip = shift any 2 tokens up to 2 lanes each (total control)
              for (const r of [0, 1]) {
                const col = getTokenCol(player.grid, r);
                if (col >= 0 && col !== 2) {
                  const dir = col > 2 ? -1 : col < 2 ? 1 : 0;
                  if (dir !== 0) setToken(player.grid, r, col + dir * 2);
                }
              }
              s.log.push(`⚡ SYNERGY (Grip x2): ${player.name} powerslides Rows 1-2 tokens 2 lanes toward center!`);
              break;
            case 'air':
              // Double air = free action refund (the combo play is "free")
              player.actionsRemaining = Math.min(player.actionsRemaining + 1, 5);
              s.log.push(`⚡ SYNERGY (Air x2): ${player.name} recovers 1 Action!`);
              break;
            case 'agility':
              // Double agility = shift ALL off-center tokens 1 lane toward center
              for (let r = 0; r < 6; r++) {
                const col = getTokenCol(player.grid, r);
                if (col >= 0 && col !== 2) {
                  setToken(player.grid, r, col + (col > 2 ? -1 : 1));
                }
              }
              s.log.push(`⚡ SYNERGY (Agility x2): ${player.name} realigns ALL tokens toward center!`);
              break;
            case 'balance':
              // Double balance = clear ALL hazard dice
              if (player.hazardDice > 0) {
                s.log.push(`⚡ SYNERGY (Balance x2): ${player.name} clears ALL ${player.hazardDice} Hazard Dice!`);
                player.hazardDice = 0;
              } else {
                s.log.push(`⚡ SYNERGY (Balance x2): ${player.name} is already clean — no dice to clear.`);
              }
              break;
          }
        }

        // VERSATILITY: 3+ unique symbols played = flow reward
        if (uniqueSymbols >= 3 && playCount >= 3) {
          player.combosTriggered.push('Versatility');
          player.totalCombos++;
          player.flow++;
          s.log.push(`🌟 VERSATILITY (3 symbols): ${player.name} gains +1 Flow!`);
        }

        // MASTERY: 4 unique symbols = ultimate combo
        if (uniqueSymbols >= 4) {
          player.combosTriggered.push('Mastery');
          player.totalCombos++;
          player.hazardDice = Math.max(0, player.hazardDice - 2);
          if (player.penalties.length > 0) {
            const removed = player.penalties.pop()!;
            s.log.push(`🏆 MASTERY (4 symbols): ${player.name} removes 2 Hazard Dice and repaired "${removed.name}"!`);
          } else {
            s.log.push(`🏆 MASTERY (4 symbols): ${player.name} removes 2 Hazard Dice!`);
          }
        }

        // PRO LINE COMBO BONUS: cards played while on pro line earn flow
        if (player.commitment === 'pro' && playCount >= 2) {
          player.flow++;
          s.log.push(`${player.name}: Pro Line combo bonus — +1 Flow.`);
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
            s.log.push(`${player.name}: Spent 1 Flow → Reroll hazard dice`);
          }
          break;
        case 'brace':
          if (player.flow >= 1) {
            player.flow--;
            s.log.push(`${player.name}: Spent 1 Flow → Brace (ignore 1 hazard push)`);
          }
          break;
        case 'ghost_copy':
          if (player.flow >= 1) {
            player.flow--;
            s.log.push(`${player.name}: Spent 1 Flow → Ghost Copy (duplicate symbol)`);
          }
          break;
        case 'scrub':
          if (player.flow >= 3) {
            player.flow -= 3;
            s.log.push(`${player.name}: Spent 3 Flow → Scrub (ignore speed limit)`);
          }
          break;
      }
      break;
    }

    case 'buy_upgrade': {
      const upgradeId = action.payload?.upgradeId as string;
      const upgrade = UPGRADES.find(u => u.id === upgradeId);
      if (!upgrade) break;
      if (player.upgrades.some(u => u.id === upgradeId)) {
        s.log.push(`${player.name}: Already owns "${upgrade.name}".`);
        break;
      }
      if (player.flow < upgrade.flowCost) {
        s.log.push(`${player.name}: Not enough Flow for "${upgrade.name}" (need ${upgrade.flowCost}, have ${player.flow}).`);
        break;
      }
      player.flow -= upgrade.flowCost;
      player.upgrades.push(upgrade);
      s.log.push(`${player.name}: Purchased "${upgrade.name}" for ${upgrade.flowCost} Flow!`);
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
      s.log.push(`${player.name}: Flipped obstacle "${drawn.name}" (${drawn.symbols.map(sym => sym).join(', ')})`);
      break;
    }

    case 'reuse_obstacle': {
      // Trail Read: tackle an obstacle already revealed by a player ahead
      // Only available if the player hasn't drawn a fresh obstacle yet this turn
      if (player.drewFreshObstacle) {
        s.log.push(`${player.name}: Already drew a fresh obstacle — can't reuse revealed obstacles.`);
        break;
      }
      const revealedIdx = (action.payload?.revealedIndex as number) ?? 0;
      if (revealedIdx >= s.roundRevealedObstacles.length) {
        s.log.push(`${player.name}: No revealed obstacle at index ${revealedIdx}.`);
        break;
      }
      // Copy the revealed obstacle into active obstacles for this player to resolve
      const reused = { ...s.roundRevealedObstacles[revealedIdx] };
      // Find which player originally revealed this obstacle
      let revealedBy = 'unknown';
      for (const [pid, line] of Object.entries(s.playerObstacleLines)) {
        if (line.some(o => o.id === reused.id)) {
          const revealerPlayer = s.players.find(p => p.id === pid);
          if (revealerPlayer) { revealedBy = revealerPlayer.name; break; }
        }
      }
      s.activeObstacles.push(reused);
      const linesAvailable = Object.keys(s.playerObstacleLines).length;
      s.log.push(`${player.name}: Trail Read — tackles "${reused.name}" from ${revealedBy}'s line (${linesAvailable} player line${linesAvailable !== 1 ? 's' : ''} visible)`);
      break;
    }

    case 'resolve_obstacle': {
      // Match an obstacle with cards. Terrain effect always fires.
      // Momentum earned is DEFERRED to end of turn.
      // If player can't match, they must Send It (2 momentum) or crash.
      const obstacleIndex = (action.payload?.obstacleIndex as number) ?? 0;
      if (obstacleIndex >= s.activeObstacles.length) break;
      const obstacle = s.activeObstacles[obstacleIndex];

      // Step 1: Terrain effect ALWAYS fires
      s.log.push(`${player.name}: Hits "${obstacle.name}" — ${obstacle.blowByText}`);
      applyObstaclePenalty(player, obstacle, s);

      // Step 2: Try to match with cards
      const matchCardIndices = findObstacleMatch(player.hand, obstacle);

      if (matchCardIndices) {
        const usedWilds = matchCardIndices.length > obstacle.symbols.length ||
          (obstacle.matchMode === 'any' && matchCardIndices.length > 1);

        const sortedIndices = [...matchCardIndices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          const matchCard = player.hand.splice(idx, 1)[0];
          s.techniqueDiscard.push(matchCard);
        }
        const resolveProgressGain = player.commitment === 'pro' ? 2 : 1;
        player.progress += resolveProgressGain;
        player.pendingMomentum++; // Deferred — applied at end of turn
        player.obstaclesCleared++;
        const wildNote = usedWilds ? ' (Forced Through!)' : '';
        s.log.push(`${player.name}: Matched "${obstacle.name}"${wildNote}! +${resolveProgressGain} Progress, +1 Pending Momentum (${player.obstaclesCleared} cleared)`);
      } else {
        // Can't match — this shouldn't happen if UI is correct (should use send_it instead)
        // Force crash
        s.log.push(`${player.name}: Cannot match "${obstacle.name}" and no momentum — CRASH!`);
        player.crashed = true;
        player.turnEnded = true;
        for (let r = 0; r < 6; r++) setToken(player.grid, r, 2);
        player.momentum = Math.max(0, player.momentum - 3);
        if (s.penaltyDeck.length > 0) {
          player.penalties.push(s.penaltyDeck.shift()!);
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
          player.penalties.push(s.penaltyDeck.shift()!);
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
      const sendCost = s.activeObstacles[sendObstacleIdx].sendItCost ?? 2;
      if (player.momentum < sendCost) {
        // Can't send it — force crash
        const crashObs = s.activeObstacles[sendObstacleIdx];
        s.log.push(`${player.name}: Hits "${crashObs.name}" — ${crashObs.blowByText}`);
        applyObstaclePenalty(player, crashObs, s);
        s.log.push(`${player.name}: Can't match or Send It — CRASH!`);
        player.crashed = true;
        player.turnEnded = true;
        for (let r = 0; r < 6; r++) setToken(player.grid, r, 2);
        player.momentum = Math.max(0, player.momentum - 3);
        if (s.penaltyDeck.length > 0) {
          player.penalties.push(s.penaltyDeck.shift()!);
          s.log.push(`${player.name}: Drew penalty card from crash.`);
        }
        s.activeObstacles.splice(sendObstacleIdx, 1);
        revealObstacle(s, player.id, crashObs);
        s.obstacleDiscard.push(crashObs);
        break;
      }

      const sentObstacle = s.activeObstacles[sendObstacleIdx];

      // Step 1: Terrain effect ALWAYS fires
      s.log.push(`${player.name}: Hits "${sentObstacle.name}" — ${sentObstacle.blowByText}`);
      applyObstaclePenalty(player, sentObstacle, s);

      // Step 2: Pay momentum cost + hazard die, earn progress
      const thisSendCost = sentObstacle.sendItCost ?? 2;
      player.momentum -= thisSendCost;
      player.hazardDice++;
      const sendProgressGain = player.commitment === 'pro' ? 2 : 1;
      player.progress += sendProgressGain;
      player.obstaclesCleared++;
      s.log.push(`${player.name}: SENDS IT through "${sentObstacle.name}"! -${thisSendCost} Momentum, +1 Hazard Die, +${sendProgressGain} Progress (${player.obstaclesCleared} cleared)`);

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
          player.penalties.push(s.penaltyDeck.shift()!);
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
        s.log.push(`${player.name}: +${player.pendingMomentum} deferred Momentum from obstacles → Momentum ${player.momentum}`);
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
function applyObstaclePenalty(player: PlayerState, obstacle: ProgressObstacle, state: GameState): void {
  switch (obstacle.penaltyType) {
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
      totalCombos: p.totalCombos,
    }));
}
