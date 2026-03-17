// ── Symbol types used on cards and obstacles ──
export type CardSymbol = 'grip' | 'air' | 'agility' | 'balance';

// ── Enum string types matching Rust serde(rename_all = "snake_case") ──

export type TechniqueType =
  | 'inside_line'
  | 'manual'
  | 'flick'
  | 'recover'
  | 'pump'
  | 'whip';

export type PenaltyType =
  | 'bent_derailleur'
  | 'snapped_brake'
  | 'tacoed_rim'
  | 'blown_seals'
  | 'dropped_chain'
  | 'arm_pump'
  | 'slipped_pedal'
  | 'loose_headset'
  | 'flat_tire'
  | 'muddy_goggles'
  | 'stretched_cable'
  | 'bent_bars';

export type ObstacleType =
  | 'loose_scree'
  | 'the_mud_bog'
  | 'double_jump'
  | 'the_10ft_drop'
  | 'tight_trees'
  | 'rapid_berms'
  | 'log_skinny'
  | 'granite_slab'
  | 'rooty_drop'
  | 'slippery_berm'
  | 'the_canyon_gap'
  | 'rock_garden'
  | 'gnarly_root_web'
  | 'steep_chute';

export type UpgradeType =
  | 'high_engagement_hubs'
  | 'oversized_rotors'
  | 'carbon_frame'
  | 'electronic_shifting'
  | 'telemetry_system'
  | 'factory_suspension';

export type TrailStage =
  | 'start_gate'
  | 'right_hip'
  | 'lower_bridge'
  | 'rock_drop'
  | 'berms_left'
  | 'the_tabletop'
  | 'shark_fin'
  | 'ski_jumps'
  | 'moon_booter'
  | 'merchant_link'
  | 'tech_woods'
  | 'brake_bumps'
  | 'tombstone'
  | 'high_berms'
  | 'hero_shot'
  // Tiger Mountain stages
  | 'the_high_traverse'
  | 'root_garden_entry'
  | 'the_vertical_chute'
  | 'needle_eye_gap'
  | 'loamy_switchbacks'
  | 'the_waterfall'
  | 'mossy_slab'
  | 'brake_bump_gully'
  | 'the_cedar_gap'
  | 'final_tech_sprint'
  | 'the_stump_jump'
  | 'exit_woods';

export type TrailHazardType =
  | 'camber_left'
  | 'camber_right'
  | 'brake_bumps'
  | 'compression'
  | 'loose_dirt';

// ── Player state ──
export interface PlayerState {
  id: string;
  name: string;
  /** 5x6 grid: grid[row][col] = true means token present. Rows 0-5, Cols 0-4 */
  grid: boolean[][];
  momentum: number;
  flow: number;
  progress: number;
  hand: TechniqueType[];
  penalties: PenaltyType[];
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
  upgrades: UpgradeType[];
  /** Flags for symbol penalties */
  cannotPedal: boolean;
  cannotBrake: boolean;
  /** Cumulative stats across the whole game */
  totalCardsPlayed: number;
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
  hazardType: TrailHazardType;
  /** Which row to push, and direction (-1 left, +1 right) */
  targetRow: number;
  pushDirection: -1 | 1;
  pushAmount: number;
}

export interface GameState {
  players: PlayerState[];
  currentPlayerIndex: number;
  round: number;
  /** Total rounds in this trail (matches trail deck length) */
  trailLength: number;
  /** Which trail pack is being played */
  trailId: string;
  phase: GamePhase;
  activeTrailCard: TrailStage | null;
  queuedTrailCard: TrailStage | null;
  trailDeck: TrailStage[];
  techniqueDeck: TechniqueType[];
  techniqueDiscard: TechniqueType[];
  penaltyDeck: PenaltyType[];
  obstacleDeck: ObstacleType[];
  obstacleDiscard: ObstacleType[];
  activeObstacles: ObstacleType[];
  trailHazards: TrailHazard[];
  currentHazards: TrailHazard[];
  /** Trail Read: each player's obstacle line — keyed by player id, built up as players take turns */
  playerObstacleLines: Record<string, ObstacleType[]>;
  /** Trail Read: flat list of all revealed obstacles (derived from playerObstacleLines for convenience) */
  roundRevealedObstacles: ObstacleType[];
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
  strategy: 'aggressive' | 'balanced' | 'conservative' | 'smart' | 'random' | 'adaptive' | 'mcts';
}

export interface SimulationResult {
  gameNumber: number;
  winner: string;
  finalStandings: { name: string; progress: number; perfectMatches: number; penalties: number; flow: number; momentum: number; cardsPlayed: number }[];
  totalRounds: number;
}
