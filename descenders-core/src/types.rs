use serde::{Deserialize, Serialize};

// ── Symbol types ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardSymbol {
    Grip,
    Air,
    Agility,
    Balance,
}

// ── Technique Cards ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechniqueCard {
    pub id: String,
    pub name: String,
    pub symbol: CardSymbol,
    pub action_text: String,
}

// ── Penalty Cards ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PenaltyCard {
    pub id: String,
    pub name: String,
    pub description: String,
}

// ── Progress Obstacles ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressObstacle {
    pub id: String,
    pub name: String,
    pub symbols: Vec<CardSymbol>,
    #[serde(default = "default_match_mode")]
    pub match_mode: Option<String>,
    #[serde(default)]
    pub send_it_cost: Option<u32>,
    pub penalty_type: String,
    pub blow_by_text: String,
}

fn default_match_mode() -> Option<String> {
    None
}

impl ProgressObstacle {
    pub fn effective_match_mode(&self) -> &str {
        self.match_mode.as_deref().unwrap_or("all")
    }

    pub fn effective_send_it_cost(&self) -> u32 {
        self.send_it_cost.unwrap_or(2)
    }
}

// ── Trail Cards ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MainTrailCard {
    pub id: u32,
    pub name: String,
    pub speed_limit: u32,
    pub checked_rows: Vec<usize>,
    pub target_lanes: Vec<usize>,
}

// ── Trail Hazards ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrailHazard {
    pub id: String,
    pub name: String,
    pub description: String,
    pub target_row: usize,
    pub push_direction: i32,
    pub push_amount: u32,
}

// ── Upgrades ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Upgrade {
    pub id: String,
    pub name: String,
    pub flow_cost: i32,
    pub description: String,
}

// ── Commitment ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Commitment {
    Main,
    Pro,
}

// ── Game Phase ──

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GamePhase {
    Setup,
    ScrollDescent,
    Commitment,
    Environment,
    Preparation,
    Sprint,
    Alignment,
    Reckoning,
    StageBreak,
    GameOver,
}

// ── Player State ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub id: String,
    pub name: String,
    pub grid: Vec<Vec<bool>>,
    pub momentum: i32,
    pub flow: i32,
    pub progress: i32,
    pub hand: Vec<TechniqueCard>,
    pub penalties: Vec<PenaltyCard>,
    pub hazard_dice: i32,
    pub actions_remaining: i32,
    pub commitment: Commitment,
    pub perfect_matches: i32,
    pub obstacles_cleared: i32,
    pub crashed: bool,
    pub turn_ended: bool,
    pub upgrades: Vec<Upgrade>,
    pub cannot_pedal: bool,
    pub cannot_brake: bool,
    pub total_cards_played: i32,
    pub drew_fresh_obstacle: bool,
    pub pending_momentum: i32,
}

// ── Game State ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub players: Vec<PlayerState>,
    pub current_player_index: usize,
    pub round: u32,
    pub trail_length: u32,
    pub trail_id: String,
    pub phase: GamePhase,
    pub active_trail_card: Option<MainTrailCard>,
    pub queued_trail_card: Option<MainTrailCard>,
    pub trail_deck: Vec<MainTrailCard>,
    pub technique_deck: Vec<TechniqueCard>,
    pub technique_discard: Vec<TechniqueCard>,
    pub penalty_deck: Vec<PenaltyCard>,
    pub obstacle_deck: Vec<ProgressObstacle>,
    pub obstacle_discard: Vec<ProgressObstacle>,
    pub active_obstacles: Vec<ProgressObstacle>,
    pub trail_hazards: Vec<TrailHazard>,
    pub current_hazards: Vec<TrailHazard>,
    pub player_obstacle_lines: std::collections::HashMap<String, Vec<ProgressObstacle>>,
    pub round_revealed_obstacles: Vec<ProgressObstacle>,
    #[serde(default)]
    pub last_hazard_rolls: Vec<serde_json::Value>,
    #[serde(default)]
    pub log: Vec<String>,
}

// ── Flow Actions ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowAction {
    Reroll,
    GhostCopy,
    Brace,
    Scrub,
}

// ── Choice (MCTS action representation) ──

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Choice {
    Pedal,
    Brake,
    Steer { row: usize, direction: i32 },
    Technique { card_index: usize },
    DrawObstacle,
    ReuseObstacle { revealed_index: usize },
    ResolveObstacle,
    SendIt,
    FlowSpend { action: FlowAction },
    CommitLine { line: Commitment },
    EndTurn,
    BuyUpgrade { upgrade_index: usize },
}

// ── GameAction (JSON interop with TypeScript) ──

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameAction {
    #[serde(rename = "type")]
    pub action_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

impl Choice {
    /// Convert a Choice to a GameAction for TypeScript interop
    pub fn to_game_action(&self) -> GameAction {
        match self {
            Choice::Pedal => GameAction {
                action_type: "pedal".into(),
                payload: None,
            },
            Choice::Brake => GameAction {
                action_type: "brake".into(),
                payload: None,
            },
            Choice::Steer { row, direction } => GameAction {
                action_type: "steer".into(),
                payload: Some(serde_json::json!({ "row": row, "direction": direction })),
            },
            Choice::Technique { card_index } => GameAction {
                action_type: "technique".into(),
                payload: Some(serde_json::json!({ "cardIndex": card_index })),
            },
            Choice::DrawObstacle => GameAction {
                action_type: "draw_obstacle".into(),
                payload: None,
            },
            Choice::ReuseObstacle { revealed_index } => GameAction {
                action_type: "reuse_obstacle".into(),
                payload: Some(serde_json::json!({ "revealedIndex": revealed_index })),
            },
            Choice::ResolveObstacle => GameAction {
                action_type: "resolve_obstacle".into(),
                payload: Some(serde_json::json!({ "obstacleIndex": 0 })),
            },
            Choice::SendIt => GameAction {
                action_type: "send_it".into(),
                payload: Some(serde_json::json!({ "obstacleIndex": 0 })),
            },
            Choice::FlowSpend { action } => {
                let action_str = match action {
                    FlowAction::Reroll => "reroll",
                    FlowAction::GhostCopy => "ghost_copy",
                    FlowAction::Brace => "brace",
                    FlowAction::Scrub => "scrub",
                };
                GameAction {
                    action_type: "flow_spend".into(),
                    payload: Some(serde_json::json!({ "flowAction": action_str })),
                }
            }
            Choice::CommitLine { line } => {
                let line_str = match line {
                    Commitment::Main => "main",
                    Commitment::Pro => "pro",
                };
                GameAction {
                    action_type: "commit_line".into(),
                    payload: Some(serde_json::json!({ "line": line_str })),
                }
            }
            Choice::EndTurn => GameAction {
                action_type: "end_turn".into(),
                payload: None,
            },
            Choice::BuyUpgrade { upgrade_index } => GameAction {
                action_type: "buy_upgrade".into(),
                payload: Some(serde_json::json!({ "upgradeIndex": upgrade_index })),
            },
        }
    }
}
