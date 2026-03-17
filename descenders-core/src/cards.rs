use rand::prelude::*;
use rand::RngExt;

use crate::types::*;

/// Technique card definition (template for creating deck copies)
struct TechniqueDef {
    name: &'static str,
    symbol: CardSymbol,
    action_text: &'static str,
    copies: usize,
}

const TECHNIQUE_DEFS: &[TechniqueDef] = &[
    TechniqueDef { name: "Inside Line", symbol: CardSymbol::Grip,    action_text: "Ignore Grip penalties this turn. Shift any 1 token up to 2 lanes.", copies: 10 },
    TechniqueDef { name: "Manual",      symbol: CardSymbol::Air,     action_text: "Swap any 2 adjacent-row tokens.", copies: 10 },
    TechniqueDef { name: "Flick",       symbol: CardSymbol::Agility, action_text: "Shift tokens in Rows 1-3 one lane toward center.", copies: 9 },
    TechniqueDef { name: "Recover",     symbol: CardSymbol::Balance, action_text: "Remove 2 Hazard Dice (or repair 1 Penalty). Center any 1 token.", copies: 9 },
    TechniqueDef { name: "Pump",        symbol: CardSymbol::Air,     action_text: "Shift tokens in Rows 4-6 one lane toward center.", copies: 7 },
    TechniqueDef { name: "Whip",        symbol: CardSymbol::Grip,    action_text: "Move any 1 token directly to any lane.", copies: 7 },
];

pub fn create_technique_deck(rng: &mut impl Rng) -> Vec<TechniqueCard> {
    let mut cards = Vec::new();
    let mut id = 0;

    for def in TECHNIQUE_DEFS {
        for _ in 0..def.copies {
            cards.push(TechniqueCard {
                id: format!("tech-{}", id),
                name: def.name.to_string(),
                symbol: def.symbol,
                action_text: def.action_text.to_string(),
            });
            id += 1;
        }
    }

    cards.shuffle(rng);
    cards
}

/// Penalty card definitions
struct PenaltyDef {
    name: &'static str,
    description: &'static str,
}

const PENALTY_DEFS: &[PenaltyDef] = &[
    PenaltyDef { name: "Bent Derailleur",  description: "Cannot use Pedal action." },
    PenaltyDef { name: "Snapped Brake",    description: "Cannot use Brake action." },
    PenaltyDef { name: "Tacoed Rim",       description: "Columns 1 and 5 are Locked (hitting them = +1 Hazard Die)." },
    PenaltyDef { name: "Blown Seals",      description: "Cannot use Flow Tokens to Ghost (copy) symbols." },
    PenaltyDef { name: "Dropped Chain",    description: "Max Momentum capped at 2." },
    PenaltyDef { name: "Arm Pump",         description: "Max Actions reduced to 3 per turn." },
    PenaltyDef { name: "Slipped Pedal",    description: "Discard 2 random cards from hand immediately." },
    PenaltyDef { name: "Loose Headset",    description: "Every Steer action adds +1 Hazard Die." },
    PenaltyDef { name: "Flat Tire",        description: "Must spend 2 Momentum to tackle any Obstacle." },
    PenaltyDef { name: "Muddy Goggles",    description: "Cannot see the Queued Main Trail Card." },
    PenaltyDef { name: "Stretched Cable",  description: "Must discard 1 card to perform a Steer action." },
    PenaltyDef { name: "Bent Bars",        description: "Row 3 and Row 4 tokens must move together." },
];

pub fn create_penalty_deck(rng: &mut impl Rng) -> Vec<PenaltyCard> {
    let mut cards = Vec::new();
    let mut id = 0;

    for def in PENALTY_DEFS {
        for _ in 0..2 {
            cards.push(PenaltyCard {
                id: format!("pen-{}", id),
                name: def.name.to_string(),
                description: def.description.to_string(),
            });
            id += 1;
        }
    }

    cards.shuffle(rng);
    cards
}

/// Obstacle definitions
struct ObstacleDef {
    id: &'static str,
    name: &'static str,
    symbols: &'static [CardSymbol],
    match_mode: Option<&'static str>,
    send_it_cost: Option<u32>,
    penalty_type: &'static str,
    blow_by_text: &'static str,
}

const OBSTACLE_DEFS: &[ObstacleDef] = &[
    ObstacleDef { id: "obs-1",  name: "Loose Scree",    symbols: &[CardSymbol::Grip],                         match_mode: None,          send_it_cost: None,    penalty_type: "Slide Out",   blow_by_text: "Row 1 token shifts 2 lanes randomly." },
    ObstacleDef { id: "obs-2",  name: "The Mud Bog",     symbols: &[CardSymbol::Grip],                         match_mode: None,          send_it_cost: None,    penalty_type: "Heavy Drag",  blow_by_text: "Lose 2 Momentum and 1 card from hand." },
    ObstacleDef { id: "obs-3",  name: "Double Jump",     symbols: &[CardSymbol::Air],                          match_mode: None,          send_it_cost: None,    penalty_type: "Case It",     blow_by_text: "Lose 2 Momentum immediately." },
    ObstacleDef { id: "obs-4",  name: "The 10ft Drop",   symbols: &[CardSymbol::Air],                          match_mode: None,          send_it_cost: None,    penalty_type: "Bottom Out",  blow_by_text: "Take 2 Hazard Dice instead of 1." },
    ObstacleDef { id: "obs-5",  name: "Tight Trees",     symbols: &[CardSymbol::Agility],                      match_mode: None,          send_it_cost: None,    penalty_type: "Wide Turn",   blow_by_text: "Row 1 shifts 1 lane away from Center." },
    ObstacleDef { id: "obs-6",  name: "Rapid Berms",     symbols: &[CardSymbol::Agility],                      match_mode: None,          send_it_cost: None,    penalty_type: "Whiplash",    blow_by_text: "Shift Row 2 and Row 3 one lane Right." },
    ObstacleDef { id: "obs-7",  name: "Log Skinny",      symbols: &[CardSymbol::Balance],                      match_mode: None,          send_it_cost: None,    penalty_type: "Stall",       blow_by_text: "Cannot Pedal or use Momentum this turn." },
    ObstacleDef { id: "obs-8",  name: "Granite Slab",    symbols: &[CardSymbol::Balance],                      match_mode: None,          send_it_cost: None,    penalty_type: "Locked",      blow_by_text: "Your Row 1 token cannot move next turn." },
    ObstacleDef { id: "obs-9",  name: "Rooty Drop",      symbols: &[CardSymbol::Grip, CardSymbol::Air],        match_mode: Some("any"),   send_it_cost: None,    penalty_type: "Wipeout",     blow_by_text: "Take 2 Hazard Dice and end turn immediately." },
    ObstacleDef { id: "obs-10", name: "Slippery Berm",   symbols: &[CardSymbol::Grip, CardSymbol::Agility],    match_mode: Some("any"),   send_it_cost: None,    penalty_type: "Wash Out",    blow_by_text: "Shift Row 1 and Row 2 three lanes." },
    ObstacleDef { id: "obs-11", name: "The Canyon Gap",  symbols: &[CardSymbol::Air, CardSymbol::Balance],     match_mode: Some("all"),   send_it_cost: Some(3), penalty_type: "Full Send",   blow_by_text: "Shift Rows 1 and 2 two lanes away from center." },
    ObstacleDef { id: "obs-12", name: "Rock Garden",     symbols: &[CardSymbol::Grip, CardSymbol::Agility],    match_mode: Some("all"),   send_it_cost: Some(3), penalty_type: "Pinball",     blow_by_text: "Shift Rows 1-3 one lane away from center." },
    ObstacleDef { id: "obs-13", name: "Gnarly Root Web", symbols: &[CardSymbol::Balance, CardSymbol::Grip],    match_mode: Some("all"),   send_it_cost: Some(3), penalty_type: "Tangled",     blow_by_text: "Shift Rows 2-4 one lane left." },
    ObstacleDef { id: "obs-14", name: "Steep Chute",     symbols: &[CardSymbol::Air, CardSymbol::Agility],     match_mode: Some("all"),   send_it_cost: Some(3), penalty_type: "Overshoot",   blow_by_text: "Shift Row 1 two lanes and Row 3 one lane away from center." },
];

pub fn create_obstacle_deck(rng: &mut impl Rng) -> Vec<ProgressObstacle> {
    let mut deck = Vec::new();
    let mut copy_id = 0;

    for def in OBSTACLE_DEFS {
        for _ in 0..3 {
            deck.push(ProgressObstacle {
                id: format!("{}-{}", def.id, copy_id),
                name: def.name.to_string(),
                symbols: def.symbols.to_vec(),
                match_mode: def.match_mode.map(|s| s.to_string()),
                send_it_cost: def.send_it_cost,
                penalty_type: def.penalty_type.to_string(),
                blow_by_text: def.blow_by_text.to_string(),
            });
            copy_id += 1;
        }
    }

    deck.shuffle(rng);
    deck
}

/// Trail pack stages: (name, speed_limit, targets per row where -1 = not checked)
struct TrailPackDef {
    id: &'static str,
    stages: &'static [(&'static str, u32, &'static [i32])],
}

const WHISTLER_A_LINE: TrailPackDef = TrailPackDef {
    id: "whistler-a-line",
    stages: &[
        ("Start Gate",     6, &[2, 2, 2, -1, -1]),
        ("Right Hip",      4, &[2, 3, 4, 4, -1]),
        ("Lower Bridge",   5, &[4, 3, 2, -1, -1]),
        ("Rock Drop",      2, &[2, 2, 2, 2, 2]),
        ("Berms (Left)",   3, &[2, 1, 0, 0, -1]),
        ("The Tabletop",   6, &[0, 1, 2, -1, -1]),
        ("Shark Fin",      4, &[2, 2, 3, 4, 4]),
        ("Ski Jumps",      5, &[4, 3, 2, -1, -1]),
        ("Moon Booter",    5, &[2, 2, 2, 2, 2]),
        ("Merchant Link",  4, &[2, 2, 1, 0, -1]),
        ("Tech Woods",     2, &[0, 0, 1, 2, 2]),
        ("Brake Bumps",    3, &[2, 3, 1, 3, -1]),
        ("Tombstone",      4, &[2, 3, 2, 1, -1]),
        ("High Berms",     4, &[0, 0, 0, -1, -1]),
        ("Hero Shot",      6, &[2, 2, 2, 2, 2]),
    ],
};

const TIGER_MOUNTAIN: TrailPackDef = TrailPackDef {
    id: "tiger-mountain",
    stages: &[
        ("The High Traverse",  4, &[2, 2, 2, -1, -1]),
        ("Root Garden Entry",  2, &[2, 1, 0, 1, 2]),
        ("The Vertical Chute", 5, &[2, 2, 2, -1, -1]),
        ("Needle Eye Gap",     4, &[1, 1, 1, 0, -1]),
        ("Loamy Switchbacks",  3, &[0, 1, 2, 3, 4]),
        ("The Waterfall",      2, &[2, 2, 2, 2, 2]),
        ("Mossy Slab",         4, &[3, 4, 4, 3, -1]),
        ("Brake Bump Gully",   3, &[2, 3, 1, 3, -1]),
        ("The Cedar Gap",      5, &[2, 2, 2, -1, -1]),
        ("Final Tech Sprint",  4, &[2, 1, 0, 1, 2]),
        ("The Stump Jump",     5, &[2, 2, 3, 4, -1]),
        ("Exit Woods",         4, &[2, 2, 2, -1, -1]),
    ],
};

pub fn create_trail_deck(trail_id: Option<&str>) -> Vec<MainTrailCard> {
    let pack = match trail_id {
        Some("tiger-mountain") => &TIGER_MOUNTAIN,
        _ => &WHISTLER_A_LINE,
    };

    pack.stages
        .iter()
        .enumerate()
        .map(|(i, &(name, speed_limit, targets))| {
            let mut checked_rows = Vec::new();
            let mut target_lanes = Vec::new();
            for (r, &t) in targets.iter().enumerate() {
                if t >= 0 {
                    checked_rows.push(r);
                    target_lanes.push(t as usize);
                }
            }
            MainTrailCard {
                id: (i + 1) as u32,
                name: name.to_string(),
                speed_limit,
                checked_rows,
                target_lanes,
            }
        })
        .collect()
}

/// Trail hazard definitions
struct TrailHazardDef {
    name: &'static str,
    description: &'static str,
    rows: &'static [usize],
    direction: &'static str,
}

const TRAIL_HAZARD_DEFS: &[TrailHazardDef] = &[
    TrailHazardDef { name: "Camber Left",  description: "Shift all tokens in Rows 1-3 one lane Left.",            rows: &[0, 1, 2], direction: "left" },
    TrailHazardDef { name: "Camber Right", description: "Shift all tokens in Rows 1-3 one lane Right.",           rows: &[0, 1, 2], direction: "right" },
    TrailHazardDef { name: "Brake Bumps",  description: "Shift Row 1 and Row 2 one lane toward the nearest Edge.", rows: &[0, 1],    direction: "edge" },
    TrailHazardDef { name: "Compression",  description: "Shift Row 3 and Row 4 one lane toward the Center.",      rows: &[2, 3],    direction: "center" },
    TrailHazardDef { name: "Loose Dirt",   description: "Shift Row 5 and Row 6 one lane in a random direction.",   rows: &[4, 5],    direction: "random" },
];

pub fn create_trail_hazards(rng: &mut impl Rng) -> Vec<TrailHazard> {
    let mut hazards = Vec::new();
    let mut id = 0;

    for _ in 0..6 {
        for def in TRAIL_HAZARD_DEFS {
            for &row in def.rows {
                let dir: i32 = match def.direction {
                    "left" => -1,
                    "right" => 1,
                    "random" => if rng.random_bool(0.5) { -1 } else { 1 },
                    _ => 1, // edge/center resolved at runtime
                };

                hazards.push(TrailHazard {
                    id: format!("hazard-{}", id),
                    name: def.name.to_string(),
                    description: def.description.to_string(),
                    target_row: row,
                    push_direction: dir,
                    push_amount: 1,
                });
                id += 1;
            }
        }
    }

    hazards.shuffle(rng);
    hazards
}

/// Upgrade definitions
pub const UPGRADE_DEFS: &[(&str, &str, i32, &str)] = &[
    ("upgrade-1", "High-Engagement Hubs", 3, "1st Pedal action/turn is 0 Actions."),
    ("upgrade-2", "Oversized Rotors",     4, "1 Brake action drops Momentum by 2."),
    ("upgrade-3", "Carbon Frame",         5, "Max Momentum = 12; Min Hand Size = 4."),
    ("upgrade-4", "Electronic Shifting",  5, "1 Steer action/turn is 0 Actions."),
    ("upgrade-5", "Telemetry System",     6, "Look at top 3 Obstacles at turn start; keep 1."),
    ("upgrade-6", "Factory Suspension",   8, "Pro Line obstacle clears gain +2 Flow instead of 1."),
];

pub fn get_upgrades() -> Vec<Upgrade> {
    UPGRADE_DEFS
        .iter()
        .map(|&(id, name, flow_cost, description)| Upgrade {
            id: id.to_string(),
            name: name.to_string(),
            flow_cost,
            description: description.to_string(),
        })
        .collect()
}
