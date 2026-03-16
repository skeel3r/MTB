// ── Symbol types used on cards and obstacles ──
export type CardSymbol = 'grip' | 'air' | 'agility' | 'balance';

// ── Progress Obstacles ──
export interface ProgressObstacle {
  id: string;
  name: string;
  /** Symbols that can be matched */
  symbols: CardSymbol[];
  /** 'all' = need every symbol, 'any' = need just one. Defaults to 'all' */
  matchMode?: 'all' | 'any';
  /** Momentum cost to Send It through this obstacle. Defaults to 2 */
  sendItCost?: number;
  penaltyType: string;
  blowByText: string;
}

// ── Upgrades (Shop) ──
export interface Upgrade {
  id: string;
  name: string;
  flowCost: number;
  description: string;
}

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
  /** Number of obstacles successfully cleared */
  obstaclesCleared: number;
  /** Whether player has crashed this turn */
  crashed: boolean;
  /** Whether turn has ended early */
  turnEnded: boolean;
  /** Purchased upgrades */
  upgrades: Upgrade[];
  /** Flags for symbol penalties */
  cannotPedal: boolean;
  cannotBrake: boolean;
  /** Technique cards played this sprint turn (for combo tracking) */
  cardsPlayedThisTurn: { symbol: CardSymbol; name: string }[];
  /** Combo bonuses earned this turn */
  combosTriggered: string[];
  /** Cumulative stats across the whole game */
  totalCardsPlayed: number;
  totalCombos: number;
  /** Trail Read: set to true once the player draws a fresh obstacle, locking them out of revealed pool */
  drewFreshObstacle: boolean;
  /** Momentum earned from obstacles this turn — applied at end of turn, not immediately */
  pendingMomentum: number;
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
  name: string;
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
  obstacleDeck: ProgressObstacle[];
  obstacleDiscard: ProgressObstacle[];
  activeObstacles: ProgressObstacle[];
  trailHazards: TrailHazard[];
  currentHazards: TrailHazard[];
  /** Trail Read: each player's obstacle line — keyed by player id, built up as players take turns */
  playerObstacleLines: Record<string, ProgressObstacle[]>;
  /** Trail Read: flat list of all revealed obstacles (derived from playerObstacleLines for convenience) */
  roundRevealedObstacles: ProgressObstacle[];
  /** Last hazard roll results per player (set during reckoning) */
  lastHazardRolls: { playerName: string; rolls: number[]; penaltyDrawn: string | null }[];
  log: string[];
}

export interface GameAction {
  type: 'pedal' | 'brake' | 'steer' | 'technique' | 'tackle' | 'pass_duel' |
        'commit_line' | 'roll_hazard' | 'flow_spend' | 'buy_upgrade' | 'next_phase' | 'end_turn' | 'draw_obstacle' | 'resolve_obstacle' | 'reuse_obstacle' | 'send_it';
  payload?: Record<string, unknown>;
}

export interface SimulationConfig {
  playerCount: number;
  gamesCount: number;
  strategy: 'aggressive' | 'balanced' | 'conservative' | 'smart';
}

export interface SimulationResult {
  gameNumber: number;
  winner: string;
  finalStandings: { name: string; progress: number; perfectMatches: number; penalties: number; flow: number; momentum: number; combosTriggered: number; cardsPlayed: number }[];
  totalRounds: number;
}
