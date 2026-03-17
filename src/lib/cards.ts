import { TechniqueCard, PenaltyCard, MainTrailCard, TrailHazard, CardSymbol, ProgressObstacle, Upgrade } from './types';

// ── Technique Cards ──
const SYMBOLS: CardSymbol[] = ['grip', 'air', 'agility', 'balance'];
const SYMBOL_NAMES: Record<CardSymbol, string> = {
  grip: 'Tire',
  air: 'Spring',
  agility: 'Bars',
  balance: 'Level',
};

/** Official technique card definitions */
const TECHNIQUE_DEFS: { name: string; symbol: CardSymbol; actionText: string; copies: number }[] = [
  { name: 'Inside Line',  symbol: 'grip',    actionText: 'Ignore Grip penalties this turn. Shift any 1 token up to 2 lanes.', copies: 10 },
  { name: 'Manual',       symbol: 'air',     actionText: 'Swap any 2 adjacent-row tokens.', copies: 10 },
  { name: 'Flick',        symbol: 'agility', actionText: 'Shift tokens in Rows 1-3 one lane toward center.', copies: 9 },
  { name: 'Recover',      symbol: 'balance', actionText: 'Remove 2 Hazard Dice (or repair 1 Penalty). Center any 1 token.', copies: 9 },
  { name: 'Pump',         symbol: 'air',     actionText: 'Shift tokens in Rows 4-6 one lane toward center.', copies: 7 },
  { name: 'Whip',         symbol: 'grip',    actionText: 'Move any 1 token directly to any lane.', copies: 7 },
];

export function createTechniqueDeck(): TechniqueCard[] {
  const cards: TechniqueCard[] = [];
  let id = 0;

  for (const def of TECHNIQUE_DEFS) {
    for (let i = 0; i < def.copies; i++) {
      cards.push({
        id: `tech-${id++}`,
        name: def.name,
        symbol: def.symbol,
        actionText: def.actionText,
      });
    }
  }

  return shuffle(cards);
}

export function createPenaltyDeck(): PenaltyCard[] {
  const cards: PenaltyCard[] = [];
  let id = 0;

  const penalties = [
    { name: 'Bent Derailleur', description: 'Cannot use Pedal action.' },
    { name: 'Snapped Brake', description: 'Cannot use Brake action.' },
    { name: 'Tacoed Rim', description: 'Columns 1 and 5 are Locked (hitting them = +1 Hazard Die).' },
    { name: 'Blown Seals', description: 'Cannot use Flow Tokens to Ghost (copy) symbols.' },
    { name: 'Dropped Chain', description: 'Max Momentum capped at 2.' },
    { name: 'Arm Pump', description: 'Max Actions reduced to 3 per turn.' },
    { name: 'Slipped Pedal', description: 'Discard 2 random cards from hand immediately.' },
    { name: 'Loose Headset', description: 'Every Steer action adds +1 Hazard Die.' },
    { name: 'Flat Tire', description: 'Must spend 2 Momentum to tackle any Obstacle.' },
    { name: 'Muddy Goggles', description: 'Cannot see the Queued Main Trail Card.' },
    { name: 'Stretched Cable', description: 'Must discard 1 card to perform a Steer action.' },
    { name: 'Bent Bars', description: 'Row 3 and Row 4 tokens must move together.' },
  ];

  for (const p of penalties) {
    for (let i = 0; i < 2; i++) {
      cards.push({ id: `pen-${id++}`, name: p.name, description: p.description });
    }
  }

  return shuffle(cards);
}

// Column label to 0-indexed lane: C1=0, C2=1, C3=2, C4=3, C5=4
const C1 = 0, C2 = 1, C3 = 2, C4 = 3, C5 = 4;

/**
 * Trail pack definitions.
 * Each entry: [name, speedLimit, targets (per row, -1 = not checked)]
 * Rows are R1-R5 (0-indexed as 0-4). Only rows with a target >= 0 are checked.
 */
export interface TrailPack {
  id: string;
  name: string;
  location: string;
  description: string;
  stages: [string, number, (number | -1)[]][];
}

export const TRAIL_PACKS: TrailPack[] = [
  {
    id: 'whistler-a-line',
    name: 'Whistler A-Line',
    location: 'Whistler, BC',
    description: 'The iconic jump trail. Big airs, fast berms, and hero moments.',
    stages: [
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
    ],
  },
  {
    id: 'tiger-mountain',
    name: 'Tiger Mountain "The Predator"',
    location: 'Issaquah, WA',
    description: 'A classic PNW steeps trail. Tight trees, root nests, and constant vertical drops.',
    stages: [
      ['The High Traverse',  4, [C3, C3, C3, -1, -1]],
      ['Root Garden Entry',  2, [C3, C2, C1, C2, C3]],
      ['The Vertical Chute', 5, [C3, C3, C3, -1, -1]],
      ['Needle Eye Gap',     4, [C2, C2, C2, C1, -1]],
      ['Loamy Switchbacks',  3, [C1, C2, C3, C4, C5]],
      ['The Waterfall',      2, [C3, C3, C3, C3, C3]],
      ['Mossy Slab',         4, [C4, C5, C5, C4, -1]],
      ['Brake Bump Gully',   3, [C3, C4, C2, C4, -1]],
      ['The Cedar Gap',      5, [C3, C3, C3, -1, -1]],
      ['Final Tech Sprint',  4, [C3, C2, C1, C2, C3]],
      ['The Stump Jump',     5, [C3, C3, C4, C5, -1]],
      ['Exit Woods',         4, [C3, C3, C3, -1, -1]],
    ],
  },
];

// ── Progress Obstacles (fixed definitions) ──
export const OBSTACLE_DEFINITIONS: ProgressObstacle[] = [
  { id: 'obs-1',  name: 'Loose Scree',    symbols: ['grip'],              penaltyType: 'Slide Out',   blowByText: 'Row 1 token shifts 2 lanes randomly.' },
  { id: 'obs-2',  name: 'The Mud Bog',     symbols: ['grip'],              penaltyType: 'Heavy Drag',  blowByText: 'Lose 2 Momentum and 1 card from hand.' },
  { id: 'obs-3',  name: 'Double Jump',     symbols: ['air'],               penaltyType: 'Case It',     blowByText: 'Lose 2 Momentum immediately.' },
  { id: 'obs-4',  name: 'The 10ft Drop',   symbols: ['air'],               penaltyType: 'Bottom Out',  blowByText: 'Take 2 Hazard Dice instead of 1.' },
  { id: 'obs-5',  name: 'Tight Trees',     symbols: ['agility'],           penaltyType: 'Wide Turn',   blowByText: 'Row 1 shifts 1 lane away from Center.' },
  { id: 'obs-6',  name: 'Rapid Berms',     symbols: ['agility'],           penaltyType: 'Whiplash',    blowByText: 'Shift Row 2 and Row 3 one lane Right.' },
  { id: 'obs-7',  name: 'Log Skinny',      symbols: ['balance'],           penaltyType: 'Stall',       blowByText: 'Cannot Pedal or use Momentum this turn.' },
  { id: 'obs-8',  name: 'Granite Slab',    symbols: ['balance'],           penaltyType: 'Locked',      blowByText: 'Your Row 1 token cannot move next turn.' },
  { id: 'obs-9',  name: 'Rooty Drop',      symbols: ['grip', 'air'],       matchMode: 'any', penaltyType: 'Wipeout',     blowByText: 'Take 2 Hazard Dice and end turn immediately.' },
  { id: 'obs-10', name: 'Slippery Berm',   symbols: ['grip', 'agility'],   matchMode: 'any', penaltyType: 'Wash Out',    blowByText: 'Shift Row 1 and Row 2 three lanes.' },
  // ── Hard Obstacles (2-symbol "all" match, 3 momentum Send It cost) ──
  { id: 'obs-11', name: 'The Canyon Gap',   symbols: ['air', 'balance'],    matchMode: 'all', sendItCost: 3, penaltyType: 'Full Send',   blowByText: 'Shift Rows 1 and 2 two lanes away from center.' },
  { id: 'obs-12', name: 'Rock Garden',      symbols: ['grip', 'agility'],   matchMode: 'all', sendItCost: 3, penaltyType: 'Pinball',     blowByText: 'Shift Rows 1-3 one lane away from center.' },
  { id: 'obs-13', name: 'Gnarly Root Web',  symbols: ['balance', 'grip'],   matchMode: 'all', sendItCost: 3, penaltyType: 'Tangled',     blowByText: 'Shift Rows 2-4 one lane left.' },
  { id: 'obs-14', name: 'Steep Chute',      symbols: ['air', 'agility'],    matchMode: 'all', sendItCost: 3, penaltyType: 'Overshoot',   blowByText: 'Shift Row 1 two lanes and Row 3 one lane away from center.' },
];

/** Create a shuffled obstacle deck (3 copies of each obstacle = 30 total) */
export function createObstacleDeck(): ProgressObstacle[] {
  const deck: ProgressObstacle[] = [];
  let copyId = 0;
  for (const obs of OBSTACLE_DEFINITIONS) {
    for (let i = 0; i < 3; i++) {
      deck.push({ ...obs, id: `${obs.id}-${copyId++}` });
    }
  }
  return shuffle(deck);
}

export function createTrailDeck(trailId?: string): MainTrailCard[] {
  const pack = TRAIL_PACKS.find(p => p.id === trailId) ?? TRAIL_PACKS[0];
  return pack.stages.map(([name, speedLimit, targets], i) => {
    const checkedRows: number[] = [];
    const targetLanes: number[] = [];
    for (let r = 0; r < targets.length; r++) {
      if (targets[r] >= 0) {
        checkedRows.push(r);
        targetLanes.push(targets[r]);
      }
    }

    return {
      id: i + 1,
      name,
      speedLimit,
      checkedRows,
      targetLanes,
    };
  });
}

/** Fixed trail hazard definitions */
const TRAIL_HAZARD_DEFS: { name: string; description: string; rows: number[]; direction: 'left' | 'right' | 'edge' | 'center' | 'random' }[] = [
  { name: 'Camber Left',   description: 'Shift all tokens in Rows 1-3 one lane Left.',                   rows: [0, 1, 2], direction: 'left' },
  { name: 'Camber Right',  description: 'Shift all tokens in Rows 1-3 one lane Right.',                  rows: [0, 1, 2], direction: 'right' },
  { name: 'Brake Bumps',   description: 'Shift Row 1 and Row 2 one lane toward the nearest Edge.',       rows: [0, 1],    direction: 'edge' },
  { name: 'Compression',   description: 'Shift Row 3 and Row 4 one lane toward the Center.',             rows: [2, 3],    direction: 'center' },
  { name: 'Loose Dirt',    description: 'Shift Row 5 and Row 6 one lane in a random direction.',          rows: [4, 5],    direction: 'random' },
];

export function createTrailHazards(): TrailHazard[] {
  const hazards: TrailHazard[] = [];
  let id = 0;

  // Create multiple copies of each hazard for the deck
  for (let copy = 0; copy < 6; copy++) {
    for (const def of TRAIL_HAZARD_DEFS) {
      for (const row of def.rows) {
        let dir: -1 | 1;
        if (def.direction === 'left') dir = -1;
        else if (def.direction === 'right') dir = 1;
        else if (def.direction === 'random') dir = Math.random() < 0.5 ? -1 : 1;
        else dir = 1; // edge/center resolved at runtime in engine

        hazards.push({
          id: `hazard-${id++}`,
          description: def.description,
          name: def.name,
          targetRow: row,
          pushDirection: dir,
          pushAmount: 1,
        });
      }
    }
  }

  return shuffle(hazards);
}

// ── Upgrade Shop ──
export const UPGRADES: Upgrade[] = [
  { id: 'upgrade-1', name: 'High-Engagement Hubs', flowCost: 3, description: '1st Pedal action/turn is 0 Actions.' },
  { id: 'upgrade-2', name: 'Oversized Rotors',     flowCost: 4, description: '1 Brake action drops Momentum by 2.' },
  { id: 'upgrade-3', name: 'Carbon Frame',          flowCost: 5, description: 'Max Momentum = 12; Min Hand Size = 4.' },
  { id: 'upgrade-4', name: 'Electronic Shifting',   flowCost: 5, description: '1 Steer action/turn is 0 Actions.' },
  { id: 'upgrade-5', name: 'Telemetry System',      flowCost: 6, description: 'Look at top 3 Obstacles at turn start; keep 1.' },
  { id: 'upgrade-6', name: 'Factory Suspension',    flowCost: 8, description: 'Pro Line obstacle clears gain +2 Flow instead of 1.' },
];

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
