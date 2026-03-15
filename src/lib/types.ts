// ── Symbol types used on cards and obstacles ──
export type CardSymbol = 'grip' | 'air' | 'agility' | 'balance';

// ── Card definitions ──
export interface TechniqueCard {
  id: string;
  name: string;
  symbol: CardSymbol;
  actionText: string;
  /** Effect function applied during play */
  effect?: (state: PlayerState) => PlayerState;
}

export interface PenaltyCard {
  id: string;
  name: string;
  description: string;
  effect?: (state: PlayerState) => PlayerState;
}

export interface MainTrailCard {
  id: number;
  name: string;
  speedLimit: number;
  /** Which rows to check during Alignment (0-indexed) */
  checkedRows: number[];
  /** Target lane for each checked row (0-4, where 2 is center) */
  targetLanes: number[];
  /** Number of obstacles on this trail section */
  obstacleCount: number;
  obstacleSymbols: CardSymbol[];
}

// ── Player state ──
export interface PlayerState {
  id: string;
  name: string;
  /** 5x6 grid: grid[row][col] = true means token present. Rows 0-5, Cols 0-4 */
  grid: boolean[][];
  momentum: number;
  flow: number;
  progress: number;
  hand: TechniqueCard[];
  penalties: PenaltyCard[];
  hazardDice: number;
  actionsRemaining: number;
  commitment: 'main' | 'pro';
  /** Track perfect matches for tiebreaking */
  perfectMatches: number;
  /** Whether player has crashed this turn */
  crashed: boolean;
  /** Whether turn has ended early */
  turnEnded: boolean;
  /** Flags for symbol penalties */
  cannotPedal: boolean;
  cannotBrake: boolean;
}

// ── Game state ──
export type GamePhase =
  | 'setup'
  | 'scroll_descent'
  | 'commitment'
  | 'environment'
  | 'preparation'
  | 'sprint'
  | 'alignment'
  | 'reckoning'
  | 'stage_break'
  | 'game_over';

export interface TrailHazard {
  id: string;
  description: string;
  /** Which row to push, and direction (-1 left, +1 right) */
  targetRow: number;
  pushDirection: -1 | 1;
  pushAmount: number;
}

export interface GameState {
  players: PlayerState[];
  currentPlayerIndex: number;
  round: number;
  phase: GamePhase;
  activeTrailCard: MainTrailCard | null;
  queuedTrailCard: MainTrailCard | null;
  trailDeck: MainTrailCard[];
  techniqueDeck: TechniqueCard[];
  techniqueDiscard: TechniqueCard[];
  penaltyDeck: PenaltyCard[];
  trailHazards: TrailHazard[];
  currentHazards: TrailHazard[];
  log: string[];
}

export interface GameAction {
  type: 'pedal' | 'brake' | 'steer' | 'technique' | 'tackle' | 'pass_duel' |
        'commit_line' | 'roll_hazard' | 'flow_spend' | 'next_phase' | 'end_turn';
  payload?: Record<string, unknown>;
}

export interface SimulationConfig {
  playerCount: number;
  gamesCount: number;
  strategy: 'aggressive' | 'balanced' | 'conservative';
}

export interface SimulationResult {
  gameNumber: number;
  winner: string;
  finalStandings: { name: string; progress: number; perfectMatches: number; penalties: number; flow: number; momentum: number }[];
  totalRounds: number;
}
