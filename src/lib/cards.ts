import { TechniqueCard, PenaltyCard, MainTrailCard, TrailHazard, CardSymbol } from './types';

// ── Technique Cards ──
const SYMBOLS: CardSymbol[] = ['grip', 'air', 'agility', 'balance'];
const SYMBOL_NAMES: Record<CardSymbol, string> = {
  grip: 'Tire',
  air: 'Spring',
  agility: 'Bars',
  balance: 'Level',
};

export function createTechniqueDeck(): TechniqueCard[] {
  const cards: TechniqueCard[] = [];
  let id = 0;

  for (const symbol of SYMBOLS) {
    // 4 copies of each symbol type, different abilities
    cards.push({
      id: `tech-${id++}`,
      name: `${SYMBOL_NAMES[symbol]} Focus`,
      symbol,
      actionText: `+1 Momentum if you match a ${SYMBOL_NAMES[symbol]} obstacle this turn.`,
    });
    cards.push({
      id: `tech-${id++}`,
      name: `${SYMBOL_NAMES[symbol]} Guard`,
      symbol,
      actionText: `Prevent the next ${SYMBOL_NAMES[symbol]} penalty this turn.`,
    });
    cards.push({
      id: `tech-${id++}`,
      name: `${SYMBOL_NAMES[symbol]} Shift`,
      symbol,
      actionText: `Steer Row 1 token 1 lane toward center for free.`,
    });
    cards.push({
      id: `tech-${id++}`,
      name: `${SYMBOL_NAMES[symbol]} Burst`,
      symbol,
      actionText: `+2 Momentum but take 1 Hazard Die.`,
    });
    // Extra copies
    cards.push({
      id: `tech-${id++}`,
      name: `${SYMBOL_NAMES[symbol]} Recovery`,
      symbol,
      actionText: `Remove 1 Hazard Die from your pool.`,
    });
  }

  return shuffle(cards);
}

export function createPenaltyDeck(): PenaltyCard[] {
  const cards: PenaltyCard[] = [];
  let id = 0;

  const penalties = [
    { name: 'Chain Snag', description: 'Lose 1 Momentum at the start of next round.' },
    { name: 'Flat Tire', description: 'Cannot Steer next turn.' },
    { name: 'Cramp', description: '-1 Action next turn.' },
    { name: 'Wobble', description: 'Row 1 token shifts 1 lane randomly.' },
    { name: 'Mud Splash', description: 'Discard 1 random card from hand.' },
    { name: 'Rock Strike', description: '+1 Hazard Die next round.' },
    { name: 'Loose Grip', description: 'Cannot play Technique cards next turn.' },
    { name: 'Wind Gust', description: 'All tokens shift 1 lane left.' },
    { name: 'Fatigue', description: 'Max 4 Actions next turn.' },
    { name: 'Slide Out', description: 'Row 1 token moves to lane 0 or 4 (random).' },
  ];

  for (const p of penalties) {
    for (let i = 0; i < 3; i++) {
      cards.push({ id: `pen-${id++}`, name: p.name, description: p.description });
    }
  }

  return shuffle(cards);
}

// Column label to 0-indexed lane: C1=0, C2=1, C3=2, C4=3, C5=4
const C1 = 0, C2 = 1, C3 = 2, C4 = 3, C5 = 4;

/**
 * Fixed trail card definitions.
 * Each entry: [name, speedLimit, rowsChecked, targets (per row, -1 = not checked)]
 * Rows are R1-R5 (0-indexed as 0-4). Only rows with a target >= 0 are checked.
 */
const TRAIL_DATA: [string, number, (number | -1)[]][] = [
  ['Start Gate',     6, [C3, C3, C3, -1, -1]],
  ['Right Hip',      4, [C3, C4, C5, C5, -1]],
  ['Lower Bridge',   5, [C5, C4, C3, -1, -1]],
  ['Rock Drop',      2, [C3, C3, C3, C3, C3]],
  ['Berms (Left)',   3, [C3, C2, C1, C1, -1]],
  ['The Tabletop',   6, [C1, C2, C3, -1, -1]],
  ['Shark Fin',      4, [C3, C3, C4, C5, C5]],
  ['Ski Jumps',      5, [C5, C4, C3, -1, -1]],
  ['Moon Booter',    5, [C3, C3, C3, C3, C3]],
  ['Merchant Link',  4, [C3, C3, C2, C1, -1]],
  ['Tech Woods',     2, [C1, C1, C2, C3, C3]],
  ['Brake Bumps',    3, [C3, C4, C2, C4, -1]],
  ['Tombstone',      4, [C3, C4, C3, C2, -1]],
  ['High Berms',     4, [C1, C1, C1, -1, -1]],
  ['Hero Shot',      6, [C3, C3, C3, C3, C3]],
];

export function createTrailDeck(): MainTrailCard[] {
  return TRAIL_DATA.map(([name, speedLimit, targets], i) => {
    const checkedRows: number[] = [];
    const targetLanes: number[] = [];
    for (let r = 0; r < targets.length; r++) {
      if (targets[r] >= 0) {
        checkedRows.push(r);
        targetLanes.push(targets[r]);
      }
    }

    // Generate obstacle symbols based on the number of checked rows
    const obstacleCount = checkedRows.length;
    const obstacleSymbols: CardSymbol[] = [];
    for (let j = 0; j < obstacleCount; j++) {
      obstacleSymbols.push(SYMBOLS[j % SYMBOLS.length]);
    }

    return {
      id: i + 1,
      name,
      speedLimit,
      checkedRows,
      targetLanes,
      obstacleCount,
      obstacleSymbols,
    };
  });
}

export function createTrailHazards(): TrailHazard[] {
  const hazards: TrailHazard[] = [];
  let id = 0;

  const descriptions = ['Rock slide', 'Rut', 'Root snag', 'Mud patch', 'Loose gravel', 'Branch'];
  for (let i = 0; i < 30; i++) {
    hazards.push({
      id: `hazard-${id++}`,
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      targetRow: Math.floor(Math.random() * 6),
      pushDirection: Math.random() < 0.5 ? -1 : 1,
      pushAmount: 1,
    });
  }

  return shuffle(hazards);
}

export function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const SYMBOL_EMOJI: Record<CardSymbol, string> = {
  grip: '🛞',
  air: '🌀',
  agility: '🔀',
  balance: '⚖️',
};

export const SYMBOL_COLORS: Record<CardSymbol, string> = {
  grip: '#e74c3c',
  air: '#3498db',
  agility: '#2ecc71',
  balance: '#f39c12',
};
