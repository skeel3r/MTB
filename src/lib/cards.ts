import { TechniqueType, PenaltyType, ObstacleType, UpgradeType, TrailStage, TrailHazard, TrailHazardType, CardSymbol } from './types';

// ── Symbol Helpers ──
const SYMBOLS: CardSymbol[] = ['grip', 'air', 'agility', 'balance'];
const SYMBOL_NAMES: Record<CardSymbol, string> = {
  grip: 'Tire',
  air: 'Spring',
  agility: 'Bars',
  balance: 'Level',
};

export { SYMBOLS, SYMBOL_NAMES };

// ── Technique Card Properties Lookup ──
export interface TechniqueProps {
  name: string;
  symbol: CardSymbol;
  actionText: string;
}

export const TECHNIQUE_PROPERTIES: Record<TechniqueType, TechniqueProps> = {
  inside_line:  { name: 'Inside Line',  symbol: 'grip',    actionText: 'Ignore Grip penalties this turn. Shift any 1 token up to 2 lanes.' },
  manual:       { name: 'Manual',       symbol: 'air',     actionText: 'Swap any 2 adjacent-row tokens.' },
  flick:        { name: 'Flick',        symbol: 'agility', actionText: 'Shift tokens in Rows 1-3 one lane toward center.' },
  recover:      { name: 'Recover',      symbol: 'balance', actionText: 'Remove 2 Hazard Dice (or repair 1 Penalty). Center any 1 token.' },
  pump:         { name: 'Pump',         symbol: 'air',     actionText: 'Shift tokens in Rows 4-6 one lane toward center.' },
  whip:         { name: 'Whip',         symbol: 'grip',    actionText: 'Move any 1 token directly to any lane.' },
};

const TECHNIQUE_COPIES: Record<TechniqueType, number> = {
  inside_line: 10,
  manual: 10,
  flick: 9,
  recover: 9,
  pump: 7,
  whip: 7,
};

export function getTechniqueSymbol(t: TechniqueType): CardSymbol {
  return TECHNIQUE_PROPERTIES[t].symbol;
}

export function getTechniqueName(t: TechniqueType): string {
  return TECHNIQUE_PROPERTIES[t].name;
}

export function getTechniqueActionText(t: TechniqueType): string {
  return TECHNIQUE_PROPERTIES[t].actionText;
}

// ── Penalty Card Properties Lookup ──
export interface PenaltyProps {
  name: string;
  description: string;
}

export const PENALTY_PROPERTIES: Record<PenaltyType, PenaltyProps> = {
  bent_derailleur:  { name: 'Bent Derailleur',  description: 'Cannot use Pedal action.' },
  snapped_brake:    { name: 'Snapped Brake',    description: 'Cannot use Brake action.' },
  tacoed_rim:       { name: 'Tacoed Rim',       description: 'Columns 1 and 5 are Locked (hitting them = +1 Hazard Die).' },
  blown_seals:      { name: 'Blown Seals',      description: 'Cannot use Flow Tokens to Ghost (copy) symbols.' },
  dropped_chain:    { name: 'Dropped Chain',     description: 'Max Momentum capped at 2.' },
  arm_pump:         { name: 'Arm Pump',          description: 'Max Actions reduced to 3 per turn.' },
  slipped_pedal:    { name: 'Slipped Pedal',     description: 'Discard 2 random cards from hand immediately.' },
  loose_headset:    { name: 'Loose Headset',     description: 'Every Steer action adds +1 Hazard Die.' },
  flat_tire:        { name: 'Flat Tire',         description: 'Must spend 2 Momentum to tackle any Obstacle.' },
  muddy_goggles:    { name: 'Muddy Goggles',    description: 'Cannot see the Queued Main Trail Card.' },
  stretched_cable:  { name: 'Stretched Cable',   description: 'Must discard 1 card to perform a Steer action.' },
  bent_bars:        { name: 'Bent Bars',         description: 'Row 3 and Row 4 tokens must move together.' },
};

export function getPenaltyName(p: PenaltyType): string {
  return PENALTY_PROPERTIES[p].name;
}

export function getPenaltyDescription(p: PenaltyType): string {
  return PENALTY_PROPERTIES[p].description;
}

// ── Obstacle Properties Lookup ──
export interface ObstacleProps {
  name: string;
  symbols: CardSymbol[];
  matchMode?: 'all' | 'any';
  sendItCost?: number;
  penaltyType: string;
  blowByText: string;
}

export const OBSTACLE_PROPERTIES: Record<ObstacleType, ObstacleProps> = {
  loose_scree:     { name: 'Loose Scree',    symbols: ['grip'],              penaltyType: 'Slide Out',   blowByText: 'Row 1 token shifts 2 lanes randomly.' },
  the_mud_bog:     { name: 'The Mud Bog',     symbols: ['grip'],              penaltyType: 'Heavy Drag',  blowByText: 'Lose 2 Momentum and 1 card from hand.' },
  double_jump:     { name: 'Double Jump',     symbols: ['air'],               penaltyType: 'Case It',     blowByText: 'Lose 2 Momentum immediately.' },
  the_10ft_drop:   { name: 'The 10ft Drop',   symbols: ['air'],               penaltyType: 'Bottom Out',  blowByText: 'Take 2 Hazard Dice instead of 1.' },
  tight_trees:     { name: 'Tight Trees',     symbols: ['agility'],           penaltyType: 'Wide Turn',   blowByText: 'Row 1 shifts 1 lane away from Center.' },
  rapid_berms:     { name: 'Rapid Berms',     symbols: ['agility'],           penaltyType: 'Whiplash',    blowByText: 'Shift Row 2 and Row 3 one lane Right.' },
  log_skinny:      { name: 'Log Skinny',      symbols: ['balance'],           penaltyType: 'Stall',       blowByText: 'Cannot Pedal or use Momentum this turn.' },
  granite_slab:    { name: 'Granite Slab',    symbols: ['balance'],           penaltyType: 'Locked',      blowByText: 'Your Row 1 token cannot move next turn.' },
  rooty_drop:      { name: 'Rooty Drop',      symbols: ['grip', 'air'],       matchMode: 'any', penaltyType: 'Wipeout',     blowByText: 'Take 2 Hazard Dice and end turn immediately.' },
  slippery_berm:   { name: 'Slippery Berm',   symbols: ['grip', 'agility'],   matchMode: 'any', penaltyType: 'Wash Out',    blowByText: 'Shift Row 1 and Row 2 three lanes.' },
  the_canyon_gap:  { name: 'The Canyon Gap',   symbols: ['air', 'balance'],    matchMode: 'all', sendItCost: 3, penaltyType: 'Full Send',   blowByText: 'Shift Rows 1 and 2 two lanes away from center.' },
  rock_garden:     { name: 'Rock Garden',      symbols: ['grip', 'agility'],   matchMode: 'all', sendItCost: 3, penaltyType: 'Pinball',     blowByText: 'Shift Rows 1-3 one lane away from center.' },
  gnarly_root_web: { name: 'Gnarly Root Web',  symbols: ['balance', 'grip'],   matchMode: 'all', sendItCost: 3, penaltyType: 'Tangled',     blowByText: 'Shift Rows 2-4 one lane left.' },
  steep_chute:     { name: 'Steep Chute',      symbols: ['air', 'agility'],    matchMode: 'all', sendItCost: 3, penaltyType: 'Overshoot',   blowByText: 'Shift Row 1 two lanes and Row 3 one lane away from center.' },
};

/** All obstacle type values for iteration */
export const ALL_OBSTACLE_TYPES: ObstacleType[] = [
  'loose_scree', 'the_mud_bog', 'double_jump', 'the_10ft_drop',
  'tight_trees', 'rapid_berms', 'log_skinny', 'granite_slab',
  'rooty_drop', 'slippery_berm',
  'the_canyon_gap', 'rock_garden', 'gnarly_root_web', 'steep_chute',
];

export function getObstacleName(o: ObstacleType): string {
  return OBSTACLE_PROPERTIES[o].name;
}

export function getObstacleSymbols(o: ObstacleType): CardSymbol[] {
  return OBSTACLE_PROPERTIES[o].symbols;
}

export function getObstacleMatchMode(o: ObstacleType): 'all' | 'any' {
  return OBSTACLE_PROPERTIES[o].matchMode ?? 'all';
}

export function getObstacleSendItCost(o: ObstacleType): number {
  return OBSTACLE_PROPERTIES[o].sendItCost ?? 2;
}

export function getObstaclePenaltyType(o: ObstacleType): string {
  return OBSTACLE_PROPERTIES[o].penaltyType;
}

export function getObstacleBlowByText(o: ObstacleType): string {
  return OBSTACLE_PROPERTIES[o].blowByText;
}

// ── Upgrade Properties Lookup ──
export interface UpgradeProps {
  name: string;
  flowCost: number;
  description: string;
}

export const UPGRADE_PROPERTIES: Record<UpgradeType, UpgradeProps> = {
  high_engagement_hubs: { name: 'High-Engagement Hubs', flowCost: 3, description: '1st Pedal action/turn is 0 Actions.' },
  oversized_rotors:     { name: 'Oversized Rotors',     flowCost: 4, description: '1 Brake action drops Momentum by 2.' },
  carbon_frame:         { name: 'Carbon Frame',          flowCost: 5, description: 'Max Momentum = 12; Min Hand Size = 4.' },
  electronic_shifting:  { name: 'Electronic Shifting',   flowCost: 5, description: '1 Steer action/turn is 0 Actions.' },
  telemetry_system:     { name: 'Telemetry System',      flowCost: 6, description: 'Look at top 3 Obstacles at turn start; keep 1.' },
  factory_suspension:   { name: 'Factory Suspension',    flowCost: 8, description: 'Pro Line obstacle clears gain +2 Flow instead of 1.' },
};

export const ALL_UPGRADE_TYPES: UpgradeType[] = [
  'high_engagement_hubs', 'oversized_rotors', 'carbon_frame',
  'electronic_shifting', 'telemetry_system', 'factory_suspension',
];

export function getUpgradeName(u: UpgradeType): string {
  return UPGRADE_PROPERTIES[u].name;
}

export function getUpgradeFlowCost(u: UpgradeType): number {
  return UPGRADE_PROPERTIES[u].flowCost;
}

export function getUpgradeDescription(u: UpgradeType): string {
  return UPGRADE_PROPERTIES[u].description;
}

// ── Trail Stage Properties Lookup ──
export interface TrailStageProps {
  name: string;
  speedLimit: number;
  checkedRows: number[];
  targetLanes: number[];
}

// Column label to 0-indexed lane: C1=0, C2=1, C3=2, C4=3, C5=4
const C1 = 0, C2 = 1, C3 = 2, C4 = 3, C5 = 4;

function buildTrailStageProps(name: string, speedLimit: number, targets: (number | -1)[]): TrailStageProps {
  const checkedRows: number[] = [];
  const targetLanes: number[] = [];
  for (let r = 0; r < targets.length; r++) {
    if (targets[r] >= 0) {
      checkedRows.push(r);
      targetLanes.push(targets[r]);
    }
  }
  return { name, speedLimit, checkedRows, targetLanes };
}

export const TRAIL_STAGE_PROPERTIES: Record<TrailStage, TrailStageProps> = {
  // Whistler A-Line
  start_gate:         buildTrailStageProps('Start Gate',     6, [C3, C3, C3, -1, -1]),
  right_hip:          buildTrailStageProps('Right Hip',      4, [C3, C4, C5, C5, -1]),
  lower_bridge:       buildTrailStageProps('Lower Bridge',   5, [C5, C4, C3, -1, -1]),
  rock_drop:          buildTrailStageProps('Rock Drop',      2, [C3, C3, C3, C3, C3]),
  berms_left:         buildTrailStageProps('Berms (Left)',   3, [C3, C2, C1, C1, -1]),
  the_tabletop:       buildTrailStageProps('The Tabletop',   6, [C1, C2, C3, -1, -1]),
  shark_fin:          buildTrailStageProps('Shark Fin',      4, [C3, C3, C4, C5, C5]),
  ski_jumps:          buildTrailStageProps('Ski Jumps',      5, [C5, C4, C3, -1, -1]),
  moon_booter:        buildTrailStageProps('Moon Booter',    5, [C3, C3, C3, C3, C3]),
  merchant_link:      buildTrailStageProps('Merchant Link',  4, [C3, C3, C2, C1, -1]),
  tech_woods:         buildTrailStageProps('Tech Woods',     2, [C1, C1, C2, C3, C3]),
  brake_bumps:        buildTrailStageProps('Brake Bumps',    3, [C3, C4, C2, C4, -1]),
  tombstone:          buildTrailStageProps('Tombstone',      4, [C3, C4, C3, C2, -1]),
  high_berms:         buildTrailStageProps('High Berms',     4, [C1, C1, C1, -1, -1]),
  hero_shot:          buildTrailStageProps('Hero Shot',      6, [C3, C3, C3, C3, C3]),
  // Tiger Mountain
  the_high_traverse:  buildTrailStageProps('The High Traverse',  4, [C3, C3, C3, -1, -1]),
  root_garden_entry:  buildTrailStageProps('Root Garden Entry',  2, [C3, C2, C1, C2, C3]),
  the_vertical_chute: buildTrailStageProps('The Vertical Chute', 5, [C3, C3, C3, -1, -1]),
  needle_eye_gap:     buildTrailStageProps('Needle Eye Gap',     4, [C2, C2, C2, C1, -1]),
  loamy_switchbacks:  buildTrailStageProps('Loamy Switchbacks',  3, [C1, C2, C3, C4, C5]),
  the_waterfall:      buildTrailStageProps('The Waterfall',      2, [C3, C3, C3, C3, C3]),
  mossy_slab:         buildTrailStageProps('Mossy Slab',         4, [C4, C5, C5, C4, -1]),
  brake_bump_gully:   buildTrailStageProps('Brake Bump Gully',   3, [C3, C4, C2, C4, -1]),
  the_cedar_gap:      buildTrailStageProps('The Cedar Gap',      5, [C3, C3, C3, -1, -1]),
  final_tech_sprint:  buildTrailStageProps('Final Tech Sprint',  4, [C3, C2, C1, C2, C3]),
  the_stump_jump:     buildTrailStageProps('The Stump Jump',     5, [C3, C3, C4, C5, -1]),
  exit_woods:         buildTrailStageProps('Exit Woods',         4, [C3, C3, C3, -1, -1]),
};

export function getTrailStageName(s: TrailStage): string {
  return TRAIL_STAGE_PROPERTIES[s].name;
}

export function getTrailStageSpeedLimit(s: TrailStage): number {
  return TRAIL_STAGE_PROPERTIES[s].speedLimit;
}

export function getTrailStageCheckedRows(s: TrailStage): number[] {
  return TRAIL_STAGE_PROPERTIES[s].checkedRows;
}

export function getTrailStageTargetLanes(s: TrailStage): number[] {
  return TRAIL_STAGE_PROPERTIES[s].targetLanes;
}

// ── Trail Hazard Properties ──
export interface TrailHazardProps {
  name: string;
  description: string;
  rows: number[];
  direction: 'left' | 'right' | 'edge' | 'center' | 'random';
}

export const TRAIL_HAZARD_PROPERTIES: Record<TrailHazardType, TrailHazardProps> = {
  camber_left:  { name: 'Camber Left',  description: 'Shift all tokens in Rows 1-3 one lane Left.',                   rows: [0, 1, 2], direction: 'left' },
  camber_right: { name: 'Camber Right', description: 'Shift all tokens in Rows 1-3 one lane Right.',                  rows: [0, 1, 2], direction: 'right' },
  brake_bumps:  { name: 'Brake Bumps',  description: 'Shift Row 1 and Row 2 one lane toward the nearest Edge.',       rows: [0, 1],    direction: 'edge' },
  compression:  { name: 'Compression',  description: 'Shift Row 3 and Row 4 one lane toward the Center.',             rows: [2, 3],    direction: 'center' },
  loose_dirt:   { name: 'Loose Dirt',   description: 'Shift Row 5 and Row 6 one lane in a random direction.',          rows: [4, 5],    direction: 'random' },
};

export function getTrailHazardName(h: TrailHazardType): string {
  return TRAIL_HAZARD_PROPERTIES[h].name;
}

export function getTrailHazardDescription(h: TrailHazardType): string {
  return TRAIL_HAZARD_PROPERTIES[h].description;
}

// ── Trail Pack definitions ──
export interface TrailPack {
  id: string;
  name: string;
  location: string;
  description: string;
  stages: TrailStage[];
}

export const TRAIL_PACKS: TrailPack[] = [
  {
    id: 'whistler-a-line',
    name: 'Whistler A-Line',
    location: 'Whistler, BC',
    description: 'The iconic jump trail. Big airs, fast berms, and hero moments.',
    stages: [
      'start_gate', 'right_hip', 'lower_bridge', 'rock_drop', 'berms_left',
      'the_tabletop', 'shark_fin', 'ski_jumps', 'moon_booter', 'merchant_link',
      'tech_woods', 'brake_bumps', 'tombstone', 'high_berms', 'hero_shot',
    ],
  },
  {
    id: 'tiger-mountain',
    name: 'Tiger Mountain "The Predator"',
    location: 'Issaquah, WA',
    description: 'A classic PNW steeps trail. Tight trees, root nests, and constant vertical drops.',
    stages: [
      'the_high_traverse', 'root_garden_entry', 'the_vertical_chute', 'needle_eye_gap',
      'loamy_switchbacks', 'the_waterfall', 'mossy_slab', 'brake_bump_gully',
      'the_cedar_gap', 'final_tech_sprint', 'the_stump_jump', 'exit_woods',
    ],
  },
];

// ── Deck creation functions ──

export function createTechniqueDeck(): TechniqueType[] {
  const cards: TechniqueType[] = [];
  for (const [type, copies] of Object.entries(TECHNIQUE_COPIES) as [TechniqueType, number][]) {
    for (let i = 0; i < copies; i++) {
      cards.push(type);
    }
  }
  return shuffle(cards);
}

export function createPenaltyDeck(): PenaltyType[] {
  const cards: PenaltyType[] = [];
  const allTypes: PenaltyType[] = [
    'bent_derailleur', 'snapped_brake', 'tacoed_rim', 'blown_seals',
    'dropped_chain', 'arm_pump', 'slipped_pedal', 'loose_headset',
    'flat_tire', 'muddy_goggles', 'stretched_cable', 'bent_bars',
  ];
  for (const type of allTypes) {
    for (let i = 0; i < 2; i++) {
      cards.push(type);
    }
  }
  return shuffle(cards);
}

/** Create a shuffled obstacle deck (3 copies of each obstacle = 42 total) */
export function createObstacleDeck(): ObstacleType[] {
  const deck: ObstacleType[] = [];
  for (const type of ALL_OBSTACLE_TYPES) {
    for (let i = 0; i < 3; i++) {
      deck.push(type);
    }
  }
  return shuffle(deck);
}

export function createTrailDeck(trailId?: string): TrailStage[] {
  const pack = TRAIL_PACKS.find(p => p.id === trailId) ?? TRAIL_PACKS[0];
  return [...pack.stages];
}

export function createTrailHazards(): TrailHazard[] {
  const hazards: TrailHazard[] = [];
  const allTypes: TrailHazardType[] = ['camber_left', 'camber_right', 'brake_bumps', 'compression', 'loose_dirt'];

  for (let copy = 0; copy < 6; copy++) {
    for (const hazardType of allTypes) {
      const props = TRAIL_HAZARD_PROPERTIES[hazardType];
      for (const row of props.rows) {
        let dir: -1 | 1;
        if (props.direction === 'left') dir = -1;
        else if (props.direction === 'right') dir = 1;
        else if (props.direction === 'random') dir = Math.random() < 0.5 ? -1 : 1;
        else dir = 1; // edge/center resolved at runtime in engine

        hazards.push({
          hazardType,
          targetRow: row,
          pushDirection: dir,
          pushAmount: 1,
        });
      }
    }
  }

  return shuffle(hazards);
}

// ── Utility ──

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
