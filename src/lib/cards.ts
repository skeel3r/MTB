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

export function createTrailDeck(): MainTrailCard[] {
  const cards: MainTrailCard[] = [];
  const names = [
    'Rocky Descent', 'Forest Trail', 'Gravel Switch', 'Mud Chute',
    'Root Garden', 'Cliff Edge', 'Stream Cross', 'Boulder Field',
    'Sand Wash', 'Tight Trees', 'Open Meadow', 'Steep Drop',
    'Technical Rock', 'Loose Shale', 'Final Sprint',
  ];

  for (let i = 0; i < 15; i++) {
    const speedLimit = 2 + Math.floor(Math.random() * 4); // 2-5
    const obstacleCount = 2 + Math.floor(Math.random() * 3); // 2-4
    const obstacleSymbols: CardSymbol[] = [];
    for (let j = 0; j < obstacleCount; j++) {
      obstacleSymbols.push(SYMBOLS[Math.floor(Math.random() * 4)]);
    }

    // Checked rows: 2-3 random rows from 0-5
    const numChecked = 2 + Math.floor(Math.random() * 2);
    const checkedRows: number[] = [];
    while (checkedRows.length < numChecked) {
      const r = Math.floor(Math.random() * 6);
      if (!checkedRows.includes(r)) checkedRows.push(r);
    }
    checkedRows.sort((a, b) => a - b);

    // Target lanes for each checked row
    const targetLanes = checkedRows.map(() => Math.floor(Math.random() * 5));

    cards.push({
      id: i + 1,
      name: names[i],
      speedLimit,
      checkedRows,
      targetLanes,
      obstacleCount,
      obstacleSymbols,
    });
  }

  return cards;
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
