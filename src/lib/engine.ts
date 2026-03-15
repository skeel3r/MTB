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
    crashed: false,
    turnEnded: false,
    cannotPedal: false,
    cannotBrake: false,
  };
}

// ── Initialize game ──
export function initGame(playerNames: string[]): GameState {
  const techniqueDeck = createTechniqueDeck();
  const players = playerNames.map((name, i) => {
    const p = createPlayer(`player-${i}`, name);
    // Draw 2 initial cards
    p.hand = techniqueDeck.splice(0, 2);
    return p;
  });

  const trailDeck = createTrailDeck();
  const queuedTrailCard = trailDeck.shift()!;

  return {
    players,
    currentPlayerIndex: 0,
    round: 0,
    phase: 'setup',
    activeTrailCard: null,
    queuedTrailCard,
    trailDeck,
    techniqueDeck,
    techniqueDiscard: [],
    penaltyDeck: createPenaltyDeck(),
    obstacleDeck: createObstacleDeck(),
    activeObstacles: [],
    trailHazards: createTrailHazards(),
    currentHazards: [],
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
    if (s.round >= 15) {
      s.phase = 'game_over';
      s.log.push('Game Over!');
      return s;
    }
    // Next round
    s.phase = 'scroll_descent';
    return executeScrollDescent(s);
  }

  if (s.phase === 'stage_break') {
    if (s.round >= 15) {
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
        }
        s.currentPlayerIndex = 0;
        s.log.push('Sprint phase! Each player has 5 Actions.');
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

  // Clear active obstacles from previous round (obstacles are now drawn manually)
  s.activeObstacles = [];

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
    const drawCount = Math.max(2, Math.min(6, player.momentum));
    const drawn = drawCards(s, drawCount);
    player.hand.push(...drawn);
    s.log.push(`${player.name} draws ${drawn.length} cards (Momentum: ${player.momentum})`);

    // Speed Trap
    if (s.activeTrailCard && player.momentum > s.activeTrailCard.speedLimit) {
      const excess = player.momentum - s.activeTrailCard.speedLimit;
      player.hazardDice += excess;
      s.log.push(`${player.name}: Speed Trap! +${excess} Hazard Dice (over speed limit)`);
    }
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

  for (const player of s.players) {
    if (player.hazardDice <= 0) {
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

    if (penalty) {
      if (s.penaltyDeck.length > 0) {
        const penaltyCard = s.penaltyDeck.shift()!;
        player.penalties.push(penaltyCard);
        s.log.push(`${player.name}: Rolled a 6! Penalty: ${penaltyCard.name} - ${penaltyCard.description}`);
      }
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

  // Flow: leader gains 1
  const leaderPlayer = s.players.find(p => p.id === leader.id)!;
  leaderPlayer.flow++;
  s.log.push(`Flow: ${leader.name} (leader) gains 1 Flow.`);

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

        // Apply technique card effects by name
        switch (card.name) {
          case 'Inside Line':
            // Ignore all Slide-Out (Grip) penalties for the rest of this turn
            // Tracked via a flag (simplified: clear any grip penalty effects)
            s.log.push(`${player.name}: Grip penalties ignored this turn.`);
            break;
          case 'Manual': {
            // Swap Row 1 token with Row 2 token
            const r1col = getTokenCol(player.grid, 0);
            const r2col = getTokenCol(player.grid, 1);
            if (r1col >= 0 && r2col >= 0) {
              setToken(player.grid, 0, r2col);
              setToken(player.grid, 1, r1col);
            }
            break;
          }
          case 'Flick': {
            // Shift any two tokens 1 lane each (auto: shift rows 1 and 2 toward center)
            for (const r of [0, 1]) {
              const col = getTokenCol(player.grid, r);
              if (col >= 0) {
                const dir = col > 2 ? -1 : col < 2 ? 1 : 0;
                if (dir !== 0) setToken(player.grid, r, col + dir);
              }
            }
            break;
          }
          case 'Recover':
            // Discard 2 Hazard Dice
            player.hazardDice = Math.max(0, player.hazardDice - 2);
            break;
        }
      }
      break;
    }

    case 'tackle': {
      // Free action - tackle an obstacle
      const obstacleIndex = (action.payload?.obstacleIndex as number) ?? 0;
      if (obstacleIndex >= s.activeObstacles.length) break;

      const obstacle = s.activeObstacles[obstacleIndex];
      // Check if player has matching cards for ALL required symbols
      const matchCardIndices: number[] = [];
      let allMatched = true;
      const usedIndices = new Set<number>();
      for (const sym of obstacle.symbols) {
        const idx = player.hand.findIndex((c, i) => c.symbol === sym && !usedIndices.has(i));
        if (idx >= 0) {
          matchCardIndices.push(idx);
          usedIndices.add(idx);
        } else {
          allMatched = false;
          break;
        }
      }

      const progressGain = player.commitment === 'pro' ? 2 : 1;

      if (allMatched) {
        // Match! Discard matching cards, gain progress and momentum
        // Remove in reverse order to preserve indices
        const sortedIndices = [...matchCardIndices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          const matchCard = player.hand.splice(idx, 1)[0];
          s.techniqueDiscard.push(matchCard);
        }
        player.progress += progressGain;
        player.momentum++;
        s.log.push(`${player.name}: Matched "${obstacle.name}"! +${progressGain} Progress, +1 Momentum`);
      } else {
        // Blow-By — apply the obstacle's specific penalty
        player.hazardDice++;
        player.momentum = Math.max(0, player.momentum - 1);
        s.log.push(`${player.name}: Blow-By on "${obstacle.name}" (${obstacle.penaltyType})! ${obstacle.blowByText}`);

        applyObstaclePenalty(player, obstacle, s);

        // Pro Line blow-by: extra hazard die + penalty card
        if (player.commitment === 'pro') {
          player.hazardDice++;
          if (s.penaltyDeck.length > 0) {
            player.penalties.push(s.penaltyDeck.shift()!);
          }
          s.log.push(`${player.name}: Pro Line Blow-By! +1 extra Hazard Die + Penalty Card`);
        }
      }

      // Remove used obstacle
      s.activeObstacles.splice(obstacleIndex, 1);

      // Check crash: 6+ hazard dice
      if (player.hazardDice >= 6) {
        player.crashed = true;
        player.turnEnded = true;
        for (let r = 0; r < 6; r++) setToken(player.grid, r, 2);
        if (s.penaltyDeck.length > 0) {
          player.penalties.push(s.penaltyDeck.shift()!);
        }
        s.log.push(`${player.name}: CRASH! Reset to center, penalty card drawn.`);
      }
      break;
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
      // Free action - draw an obstacle from the deck
      if (s.obstacleDeck.length === 0) {
        s.obstacleDeck = createObstacleDeck();
      }
      const drawn = s.obstacleDeck.shift()!;
      s.activeObstacles.push(drawn);
      s.log.push(`${player.name}: Drew obstacle "${drawn.name}" (${drawn.symbols.map(sym => sym).join(', ')})`);
      break;
    }

    case 'end_turn': {
      player.turnEnded = true;
      s.log.push(`${player.name}: Ends turn.`);

      // Move to next player or next phase
      if (playerIndex < s.players.length - 1) {
        s.currentPlayerIndex = playerIndex + 1;
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
      perfectMatches: p.perfectMatches,
      penalties: p.penalties.length,
      flow: p.flow,
      momentum: p.momentum,
    }));
}
