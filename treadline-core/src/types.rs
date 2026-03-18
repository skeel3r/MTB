use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TechniqueType {
    InsideLine,
    Manual,
    Flick,
    Recover,
    Pump,
    Whip,
}

struct TechniqueProperties {
    name: &'static str,
    symbol: CardSymbol,
    action_text: &'static str,
    copies: usize,
}

const TECHNIQUE_DATA: [TechniqueProperties; 6] = [
    TechniqueProperties { name: "Inside Line", symbol: CardSymbol::Grip,    action_text: "Ignore Grip penalties this turn. Shift any 1 token up to 2 lanes.", copies: 10 },
    TechniqueProperties { name: "Manual",      symbol: CardSymbol::Air,     action_text: "Swap any 2 adjacent-row tokens.", copies: 10 },
    TechniqueProperties { name: "Flick",       symbol: CardSymbol::Agility, action_text: "Shift tokens in Rows 1-3 one lane toward center.", copies: 9 },
    TechniqueProperties { name: "Recover",     symbol: CardSymbol::Balance, action_text: "Remove 2 Hazard Dice (or repair 1 Penalty). Center any 1 token.", copies: 9 },
    TechniqueProperties { name: "Pump",        symbol: CardSymbol::Air,     action_text: "Shift tokens in Rows 4-6 one lane toward center.", copies: 7 },
    TechniqueProperties { name: "Whip",        symbol: CardSymbol::Grip,    action_text: "Move any 1 token directly to any lane.", copies: 7 },
];

const ALL_TECHNIQUES: [TechniqueType; 6] = [
    TechniqueType::InsideLine,
    TechniqueType::Manual,
    TechniqueType::Flick,
    TechniqueType::Recover,
    TechniqueType::Pump,
    TechniqueType::Whip,
];

impl TechniqueType {
    #[inline]
    fn props(&self) -> &'static TechniqueProperties {
        &TECHNIQUE_DATA[*self as usize]
    }

    #[inline]
    pub fn name(&self) -> &'static str { self.props().name }

    #[inline]
    pub fn symbol(&self) -> CardSymbol { self.props().symbol }

    #[inline]
    pub fn action_text(&self) -> &'static str { self.props().action_text }

    #[inline]
    pub fn copies(&self) -> usize { self.props().copies }

    pub fn all() -> &'static [TechniqueType] { &ALL_TECHNIQUES }
}

// ── Penalty Cards ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PenaltyType {
    BentDerailleur,
    SnappedBrake,
    TacoedRim,
    BlownSeals,
    DroppedChain,
    ArmPump,
    SlippedPedal,
    LooseHeadset,
    FlatTire,
    MuddyGoggles,
    StretchedCable,
    BentBars,
}

struct PenaltyProperties {
    name: &'static str,
    description: &'static str,
}

const PENALTY_DATA: [PenaltyProperties; 12] = [
    PenaltyProperties { name: "Bent Derailleur",  description: "Cannot use Pedal action." },
    PenaltyProperties { name: "Snapped Brake",    description: "Cannot use Brake action." },
    PenaltyProperties { name: "Tacoed Rim",       description: "Columns 1 and 5 are Locked (hitting them = +1 Hazard Die)." },
    PenaltyProperties { name: "Blown Seals",      description: "Cannot use Flow Tokens to Ghost (copy) symbols." },
    PenaltyProperties { name: "Dropped Chain",    description: "Max Momentum capped at 2." },
    PenaltyProperties { name: "Arm Pump",         description: "Max Actions reduced to 3 per turn." },
    PenaltyProperties { name: "Slipped Pedal",    description: "Discard 2 random cards from hand immediately." },
    PenaltyProperties { name: "Loose Headset",    description: "Every Steer action adds +1 Hazard Die." },
    PenaltyProperties { name: "Flat Tire",        description: "Must spend 2 Momentum to tackle any Obstacle." },
    PenaltyProperties { name: "Muddy Goggles",    description: "Cannot see the Queued Main Trail Card." },
    PenaltyProperties { name: "Stretched Cable",  description: "Must discard 1 card to perform a Steer action." },
    PenaltyProperties { name: "Bent Bars",        description: "Row 3 and Row 4 tokens must move together." },
];

const ALL_PENALTIES: [PenaltyType; 12] = [
    PenaltyType::BentDerailleur,
    PenaltyType::SnappedBrake,
    PenaltyType::TacoedRim,
    PenaltyType::BlownSeals,
    PenaltyType::DroppedChain,
    PenaltyType::ArmPump,
    PenaltyType::SlippedPedal,
    PenaltyType::LooseHeadset,
    PenaltyType::FlatTire,
    PenaltyType::MuddyGoggles,
    PenaltyType::StretchedCable,
    PenaltyType::BentBars,
];

impl PenaltyType {
    #[inline]
    fn props(&self) -> &'static PenaltyProperties {
        &PENALTY_DATA[*self as usize]
    }

    #[inline]
    pub fn name(&self) -> &'static str { self.props().name }

    #[inline]
    pub fn description(&self) -> &'static str { self.props().description }

    pub fn all() -> &'static [PenaltyType] { &ALL_PENALTIES }
}

// ── Progress Obstacles ──

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchMode {
    Any,
    All,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PenaltyEffect {
    SlideOut,
    HeavyDrag,
    CaseIt,
    BottomOut,
    WideTurn,
    Whiplash,
    Stall,
    Locked,
    Wipeout,
    WashOut,
    FullSend,
    Pinball,
    Tangled,
    Overshoot,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObstacleType {
    LooseScree,
    TheMudBog,
    DoubleJump,
    The10ftDrop,
    TightTrees,
    RapidBerms,
    LogSkinny,
    GraniteSlab,
    RootyDrop,
    SlipperyBerm,
    TheCanyonGap,
    RockGarden,
    GnarlyRootWeb,
    SteepChute,
}

struct ObstacleProperties {
    name: &'static str,
    symbols: &'static [CardSymbol],
    match_mode: MatchMode,
    send_it_cost: u32,
    penalty_effect: PenaltyEffect,
    blow_by_text: &'static str,
    copies: usize,
}

const OBSTACLE_DATA: [ObstacleProperties; 14] = [
    ObstacleProperties { name: "Loose Scree",    symbols: &[CardSymbol::Grip],                      match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::SlideOut,  blow_by_text: "Row 1 token shifts 2 lanes randomly.", copies: 3 },
    ObstacleProperties { name: "The Mud Bog",     symbols: &[CardSymbol::Grip],                      match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::HeavyDrag, blow_by_text: "Lose 2 Momentum and 1 card from hand.", copies: 3 },
    ObstacleProperties { name: "Double Jump",     symbols: &[CardSymbol::Air],                       match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::CaseIt,    blow_by_text: "Lose 2 Momentum immediately.", copies: 3 },
    ObstacleProperties { name: "The 10ft Drop",   symbols: &[CardSymbol::Air],                       match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::BottomOut,  blow_by_text: "Take 2 Hazard Dice instead of 1.", copies: 3 },
    ObstacleProperties { name: "Tight Trees",     symbols: &[CardSymbol::Agility],                   match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::WideTurn,   blow_by_text: "Row 1 shifts 1 lane away from Center.", copies: 3 },
    ObstacleProperties { name: "Rapid Berms",     symbols: &[CardSymbol::Agility],                   match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::Whiplash,   blow_by_text: "Shift Row 2 and Row 3 one lane Right.", copies: 3 },
    ObstacleProperties { name: "Log Skinny",      symbols: &[CardSymbol::Balance],                   match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::Stall,      blow_by_text: "Cannot Pedal or use Momentum this turn.", copies: 3 },
    ObstacleProperties { name: "Granite Slab",    symbols: &[CardSymbol::Balance],                   match_mode: MatchMode::All, send_it_cost: 2, penalty_effect: PenaltyEffect::Locked,     blow_by_text: "Your Row 1 token cannot move next turn.", copies: 3 },
    ObstacleProperties { name: "Rooty Drop",      symbols: &[CardSymbol::Grip, CardSymbol::Air],     match_mode: MatchMode::Any, send_it_cost: 2, penalty_effect: PenaltyEffect::Wipeout,    blow_by_text: "Take 2 Hazard Dice and end turn immediately.", copies: 3 },
    ObstacleProperties { name: "Slippery Berm",   symbols: &[CardSymbol::Grip, CardSymbol::Agility], match_mode: MatchMode::Any, send_it_cost: 2, penalty_effect: PenaltyEffect::WashOut,    blow_by_text: "Shift Row 1 and Row 2 three lanes.", copies: 3 },
    ObstacleProperties { name: "The Canyon Gap",  symbols: &[CardSymbol::Air, CardSymbol::Balance],  match_mode: MatchMode::All, send_it_cost: 3, penalty_effect: PenaltyEffect::FullSend,   blow_by_text: "Shift Rows 1 and 2 two lanes away from center.", copies: 3 },
    ObstacleProperties { name: "Rock Garden",     symbols: &[CardSymbol::Grip, CardSymbol::Agility], match_mode: MatchMode::All, send_it_cost: 3, penalty_effect: PenaltyEffect::Pinball,    blow_by_text: "Shift Rows 1-3 one lane away from center.", copies: 3 },
    ObstacleProperties { name: "Gnarly Root Web", symbols: &[CardSymbol::Balance, CardSymbol::Grip], match_mode: MatchMode::All, send_it_cost: 3, penalty_effect: PenaltyEffect::Tangled,    blow_by_text: "Shift Rows 2-4 one lane left.", copies: 3 },
    ObstacleProperties { name: "Steep Chute",     symbols: &[CardSymbol::Air, CardSymbol::Agility],  match_mode: MatchMode::All, send_it_cost: 3, penalty_effect: PenaltyEffect::Overshoot,  blow_by_text: "Shift Row 1 two lanes and Row 3 one lane away from center.", copies: 3 },
];

const ALL_OBSTACLES: [ObstacleType; 14] = [
    ObstacleType::LooseScree,
    ObstacleType::TheMudBog,
    ObstacleType::DoubleJump,
    ObstacleType::The10ftDrop,
    ObstacleType::TightTrees,
    ObstacleType::RapidBerms,
    ObstacleType::LogSkinny,
    ObstacleType::GraniteSlab,
    ObstacleType::RootyDrop,
    ObstacleType::SlipperyBerm,
    ObstacleType::TheCanyonGap,
    ObstacleType::RockGarden,
    ObstacleType::GnarlyRootWeb,
    ObstacleType::SteepChute,
];

impl ObstacleType {
    #[inline]
    fn props(&self) -> &'static ObstacleProperties {
        &OBSTACLE_DATA[*self as usize]
    }

    #[inline]
    pub fn name(&self) -> &'static str { self.props().name }

    #[inline]
    pub fn symbols(&self) -> &'static [CardSymbol] { self.props().symbols }

    #[inline]
    pub fn match_mode(&self) -> MatchMode { self.props().match_mode }

    #[inline]
    pub fn send_it_cost(&self) -> u32 { self.props().send_it_cost }

    #[inline]
    pub fn penalty_effect(&self) -> PenaltyEffect { self.props().penalty_effect }

    #[inline]
    pub fn blow_by_text(&self) -> &'static str { self.props().blow_by_text }

    #[inline]
    pub fn copies(&self) -> usize { self.props().copies }

    pub fn all() -> &'static [ObstacleType] { &ALL_OBSTACLES }
}

// ── Trail Stages ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrailStage {
    // Whistler A-Line
    StartGate,
    RightHip,
    LowerBridge,
    RockDrop,
    BermsLeft,
    TheTabletop,
    SharkFin,
    SkiJumps,
    MoonBooter,
    MerchantLink,
    TechWoods,
    TrailBrakeBumps,
    Tombstone,
    HighBerms,
    HeroShot,
    // Tiger Mountain
    TheHighTraverse,
    RootGardenEntry,
    TheVerticalChute,
    NeedleEyeGap,
    LoamySwitchbacks,
    TheWaterfall,
    MossySlab,
    BrakeBumpGully,
    TheCedarGap,
    FinalTechSprint,
    TheStumpJump,
    ExitWoods,
}

struct TrailStageProperties {
    name: &'static str,
    speed_limit: u32,
    checked_rows: &'static [usize],
    target_lanes: &'static [usize],
}

const TRAIL_STAGE_DATA: [TrailStageProperties; 27] = [
    // Whistler A-Line
    TrailStageProperties { name: "Start Gate",     speed_limit: 6, checked_rows: &[0, 1, 2],          target_lanes: &[2, 2, 2] },
    TrailStageProperties { name: "Right Hip",      speed_limit: 4, checked_rows: &[0, 1, 2, 3],       target_lanes: &[2, 3, 4, 4] },
    TrailStageProperties { name: "Lower Bridge",   speed_limit: 5, checked_rows: &[0, 1, 2],          target_lanes: &[4, 3, 2] },
    TrailStageProperties { name: "Rock Drop",      speed_limit: 2, checked_rows: &[0, 1, 2, 3, 4],    target_lanes: &[2, 2, 2, 2, 2] },
    TrailStageProperties { name: "Berms (Left)",   speed_limit: 3, checked_rows: &[0, 1, 2, 3],       target_lanes: &[2, 1, 0, 0] },
    TrailStageProperties { name: "The Tabletop",   speed_limit: 6, checked_rows: &[0, 1, 2],          target_lanes: &[0, 1, 2] },
    TrailStageProperties { name: "Shark Fin",      speed_limit: 4, checked_rows: &[0, 1, 2, 3, 4],    target_lanes: &[2, 2, 3, 4, 4] },
    TrailStageProperties { name: "Ski Jumps",      speed_limit: 5, checked_rows: &[0, 1, 2],          target_lanes: &[4, 3, 2] },
    TrailStageProperties { name: "Moon Booter",    speed_limit: 5, checked_rows: &[0, 1, 2, 3, 4],    target_lanes: &[2, 2, 2, 2, 2] },
    TrailStageProperties { name: "Merchant Link",  speed_limit: 4, checked_rows: &[0, 1, 2, 3],       target_lanes: &[2, 2, 1, 0] },
    TrailStageProperties { name: "Tech Woods",     speed_limit: 2, checked_rows: &[0, 1, 2, 3, 4],    target_lanes: &[0, 0, 1, 2, 2] },
    TrailStageProperties { name: "Brake Bumps",    speed_limit: 3, checked_rows: &[0, 1, 2, 3],       target_lanes: &[2, 3, 1, 3] },
    TrailStageProperties { name: "Tombstone",      speed_limit: 4, checked_rows: &[0, 1, 2, 3],       target_lanes: &[2, 3, 2, 1] },
    TrailStageProperties { name: "High Berms",     speed_limit: 4, checked_rows: &[0, 1, 2],          target_lanes: &[0, 0, 0] },
    TrailStageProperties { name: "Hero Shot",      speed_limit: 6, checked_rows: &[0, 1, 2, 3, 4],    target_lanes: &[2, 2, 2, 2, 2] },
    // Tiger Mountain
    TrailStageProperties { name: "The High Traverse",  speed_limit: 4, checked_rows: &[0, 1, 2],       target_lanes: &[2, 2, 2] },
    TrailStageProperties { name: "Root Garden Entry",  speed_limit: 2, checked_rows: &[0, 1, 2, 3, 4], target_lanes: &[2, 1, 0, 1, 2] },
    TrailStageProperties { name: "The Vertical Chute", speed_limit: 5, checked_rows: &[0, 1, 2],       target_lanes: &[2, 2, 2] },
    TrailStageProperties { name: "Needle Eye Gap",     speed_limit: 4, checked_rows: &[0, 1, 2, 3],    target_lanes: &[1, 1, 1, 0] },
    TrailStageProperties { name: "Loamy Switchbacks",  speed_limit: 3, checked_rows: &[0, 1, 2, 3, 4], target_lanes: &[0, 1, 2, 3, 4] },
    TrailStageProperties { name: "The Waterfall",      speed_limit: 2, checked_rows: &[0, 1, 2, 3, 4], target_lanes: &[2, 2, 2, 2, 2] },
    TrailStageProperties { name: "Mossy Slab",         speed_limit: 4, checked_rows: &[0, 1, 2, 3],    target_lanes: &[3, 4, 4, 3] },
    TrailStageProperties { name: "Brake Bump Gully",   speed_limit: 3, checked_rows: &[0, 1, 2, 3],    target_lanes: &[2, 3, 1, 3] },
    TrailStageProperties { name: "The Cedar Gap",      speed_limit: 5, checked_rows: &[0, 1, 2],       target_lanes: &[2, 2, 2] },
    TrailStageProperties { name: "Final Tech Sprint",  speed_limit: 4, checked_rows: &[0, 1, 2, 3, 4], target_lanes: &[2, 1, 0, 1, 2] },
    TrailStageProperties { name: "The Stump Jump",     speed_limit: 5, checked_rows: &[0, 1, 2, 3],    target_lanes: &[2, 2, 3, 4] },
    TrailStageProperties { name: "Exit Woods",         speed_limit: 4, checked_rows: &[0, 1, 2],       target_lanes: &[2, 2, 2] },
];

const WHISTLER_A_LINE_STAGES: [TrailStage; 15] = [
    TrailStage::StartGate, TrailStage::RightHip, TrailStage::LowerBridge,
    TrailStage::RockDrop, TrailStage::BermsLeft, TrailStage::TheTabletop,
    TrailStage::SharkFin, TrailStage::SkiJumps, TrailStage::MoonBooter,
    TrailStage::MerchantLink, TrailStage::TechWoods, TrailStage::TrailBrakeBumps,
    TrailStage::Tombstone, TrailStage::HighBerms, TrailStage::HeroShot,
];

const TIGER_MOUNTAIN_STAGES: [TrailStage; 12] = [
    TrailStage::TheHighTraverse, TrailStage::RootGardenEntry, TrailStage::TheVerticalChute,
    TrailStage::NeedleEyeGap, TrailStage::LoamySwitchbacks, TrailStage::TheWaterfall,
    TrailStage::MossySlab, TrailStage::BrakeBumpGully, TrailStage::TheCedarGap,
    TrailStage::FinalTechSprint, TrailStage::TheStumpJump, TrailStage::ExitWoods,
];

impl TrailStage {
    #[inline]
    fn props(&self) -> &'static TrailStageProperties {
        &TRAIL_STAGE_DATA[*self as usize]
    }

    #[inline]
    pub fn name(&self) -> &'static str { self.props().name }

    #[inline]
    pub fn speed_limit(&self) -> u32 { self.props().speed_limit }

    #[inline]
    pub fn checked_rows(&self) -> &'static [usize] { self.props().checked_rows }

    #[inline]
    pub fn target_lanes(&self) -> &'static [usize] { self.props().target_lanes }

    pub fn whistler_a_line() -> &'static [TrailStage] { &WHISTLER_A_LINE_STAGES }

    pub fn tiger_mountain() -> &'static [TrailStage] { &TIGER_MOUNTAIN_STAGES }

    pub fn trail_stages(trail_id: Option<&str>) -> &'static [TrailStage] {
        match trail_id {
            Some("tiger-mountain") => Self::tiger_mountain(),
            _ => Self::whistler_a_line(),
        }
    }
}

// ── Trail Hazards ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrailHazardType {
    CamberLeft,
    CamberRight,
    BrakeBumps,
    Compression,
    LooseDirt,
}

struct TrailHazardProperties {
    name: &'static str,
    description: &'static str,
    rows: &'static [usize],
    direction: &'static str,
}

const TRAIL_HAZARD_DATA: [TrailHazardProperties; 5] = [
    TrailHazardProperties { name: "Camber Left",  description: "Shift all tokens in Rows 1-3 one lane Left.",             rows: &[0, 1, 2], direction: "left" },
    TrailHazardProperties { name: "Camber Right", description: "Shift all tokens in Rows 1-3 one lane Right.",            rows: &[0, 1, 2], direction: "right" },
    TrailHazardProperties { name: "Brake Bumps",  description: "Shift Row 1 and Row 2 one lane toward the nearest Edge.", rows: &[0, 1],    direction: "edge" },
    TrailHazardProperties { name: "Compression",  description: "Shift Row 3 and Row 4 one lane toward the Center.",       rows: &[2, 3],    direction: "center" },
    TrailHazardProperties { name: "Loose Dirt",   description: "Shift Row 5 and Row 6 one lane in a random direction.",    rows: &[4, 5],    direction: "random" },
];

const ALL_TRAIL_HAZARDS: [TrailHazardType; 5] = [
    TrailHazardType::CamberLeft,
    TrailHazardType::CamberRight,
    TrailHazardType::BrakeBumps,
    TrailHazardType::Compression,
    TrailHazardType::LooseDirt,
];

impl TrailHazardType {
    #[inline]
    fn props(&self) -> &'static TrailHazardProperties {
        &TRAIL_HAZARD_DATA[*self as usize]
    }

    #[inline]
    pub fn name(&self) -> &'static str { self.props().name }

    #[inline]
    pub fn description(&self) -> &'static str { self.props().description }

    #[inline]
    pub fn rows(&self) -> &'static [usize] { self.props().rows }

    #[inline]
    pub fn direction(&self) -> &'static str { self.props().direction }

    pub fn all() -> &'static [TrailHazardType] { &ALL_TRAIL_HAZARDS }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrailHazard {
    pub hazard_type: TrailHazardType,
    pub target_row: usize,
    pub push_direction: i32,
    pub push_amount: u32,
}

// ── Upgrades ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UpgradeType {
    HighEngagementHubs,
    OversizedRotors,
    CarbonFrame,
    ElectronicShifting,
    TelemetrySystem,
    FactorySuspension,
}

struct UpgradeProperties {
    name: &'static str,
    flow_cost: i32,
    description: &'static str,
}

const UPGRADE_DATA: [UpgradeProperties; 6] = [
    UpgradeProperties { name: "High-Engagement Hubs", flow_cost: 3, description: "1st Pedal action/turn is 0 Actions." },
    UpgradeProperties { name: "Oversized Rotors",     flow_cost: 4, description: "1 Brake action drops Momentum by 2." },
    UpgradeProperties { name: "Carbon Frame",         flow_cost: 5, description: "Max Momentum = 12; Min Hand Size = 4." },
    UpgradeProperties { name: "Electronic Shifting",  flow_cost: 5, description: "1 Steer action/turn is 0 Actions." },
    UpgradeProperties { name: "Telemetry System",     flow_cost: 6, description: "Look at top 3 Obstacles at turn start; keep 1." },
    UpgradeProperties { name: "Factory Suspension",   flow_cost: 8, description: "Pro Line obstacle clears gain +2 Flow instead of 1." },
];

const ALL_UPGRADES: [UpgradeType; 6] = [
    UpgradeType::HighEngagementHubs,
    UpgradeType::OversizedRotors,
    UpgradeType::CarbonFrame,
    UpgradeType::ElectronicShifting,
    UpgradeType::TelemetrySystem,
    UpgradeType::FactorySuspension,
];

impl UpgradeType {
    #[inline]
    fn props(&self) -> &'static UpgradeProperties {
        &UPGRADE_DATA[*self as usize]
    }

    #[inline]
    pub fn name(&self) -> &'static str { self.props().name }

    #[inline]
    pub fn flow_cost(&self) -> i32 { self.props().flow_cost }

    #[inline]
    pub fn description(&self) -> &'static str { self.props().description }

    pub fn all() -> &'static [UpgradeType] { &ALL_UPGRADES }
}

// ── Commitment ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Commitment {
    Main,
    Pro,
}

// ── Game Phase ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
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
    pub hand: Vec<TechniqueType>,
    pub penalties: Vec<PenaltyType>,
    pub hazard_dice: i32,
    pub actions_remaining: i32,
    pub commitment: Commitment,
    pub perfect_matches: i32,
    pub obstacles_cleared: i32,
    pub crashed: bool,
    pub turn_ended: bool,
    pub upgrades: Vec<UpgradeType>,
    pub cannot_pedal: bool,
    pub cannot_brake: bool,
    pub total_cards_played: i32,
    pub drew_fresh_obstacle: bool,
    /// Trail Read: player index whose obstacle line this player is committed to
    pub trail_read_committed_player: Option<usize>,
    /// Trail Read: next obstacle index to resolve in the committed player's line
    pub trail_read_next_index: usize,
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
    pub active_trail_card: Option<TrailStage>,
    pub queued_trail_card: Option<TrailStage>,
    pub trail_deck: VecDeque<TrailStage>,
    pub technique_deck: VecDeque<TechniqueType>,
    pub technique_discard: VecDeque<TechniqueType>,
    pub penalty_deck: VecDeque<PenaltyType>,
    pub obstacle_deck: VecDeque<ObstacleType>,
    pub obstacle_discard: VecDeque<ObstacleType>,
    pub active_obstacles: Vec<ObstacleType>,
    pub trail_hazards: VecDeque<TrailHazard>,
    pub current_hazards: Vec<TrailHazard>,
    pub player_obstacle_lines: std::collections::HashMap<String, Vec<ObstacleType>>,
    pub round_revealed_obstacles: Vec<ObstacleType>,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Choice {
    Pedal,
    Brake,
    Steer { row: usize, direction: i32 },
    /// Abstract steer: ISMCTS picks this, then `refine_choice` resolves to a
    /// concrete `Steer { row, direction }` using alignment heuristics.
    SteerBest,
    Technique { card_index: usize },
    /// Abstract technique: ISMCTS picks this, then `refine_choice` resolves to
    /// a concrete `Technique { card_index }` (first card, or random).
    TechniqueBest,
    DrawObstacle,
    ReuseObstacle { revealed_index: usize },
    ResolveObstacle,
    SendIt,
    FlowSpend { action: FlowAction },
    CommitLine { line: Commitment },
    EndTurn,
    BuyUpgrade { upgrade: UpgradeType },
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
            // Abstract choices should be refined before conversion
            Choice::SteerBest => GameAction {
                action_type: "steer".into(),
                payload: Some(serde_json::json!({ "row": 0, "direction": 1 })),
            },
            Choice::TechniqueBest => GameAction {
                action_type: "technique".into(),
                payload: Some(serde_json::json!({ "cardIndex": 0 })),
            },
            Choice::EndTurn => GameAction {
                action_type: "end_turn".into(),
                payload: None,
            },
            Choice::BuyUpgrade { upgrade } => GameAction {
                action_type: "buy_upgrade".into(),
                payload: Some(serde_json::json!({ "upgrade": upgrade })),
            },
        }
    }
}

// ── Game log types (shared between runner and gui) ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameRunOutput {
    pub version: u32,
    pub game_started_at: String,
    pub game_ended_at: String,
    pub player_names: Vec<String>,
    pub iterations: u32,
    pub num_players: u32,
    pub trail_id: String,
    pub initial_state: GameState,
    pub final_standings: Vec<FinalStanding>,
    pub entries: Vec<StructuredLogEntry>,
    pub duration_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalStanding {
    pub name: String,
    pub obstacles_cleared: i32,
    pub progress: i32,
    pub perfect_matches: i32,
    pub penalties: i32,
    pub flow: i32,
    pub momentum: i32,
    pub reward: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredLogEntry {
    pub seq: u32,
    pub round: u32,
    pub phase: String,
    pub player_index: usize,
    pub choice: Choice,
}
