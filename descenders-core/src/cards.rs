use rand::prelude::*;
use rand::RngExt;

use crate::types::*;

pub fn create_technique_deck(rng: &mut impl Rng) -> Vec<TechniqueType> {
    let mut cards = Vec::new();
    for &card_type in TechniqueType::all() {
        for _ in 0..card_type.copies() {
            cards.push(card_type);
        }
    }
    cards.shuffle(rng);
    cards
}

pub fn create_penalty_deck(rng: &mut impl Rng) -> Vec<PenaltyType> {
    let mut cards = Vec::new();
    for &penalty in PenaltyType::all() {
        for _ in 0..2 {
            cards.push(penalty);
        }
    }
    cards.shuffle(rng);
    cards
}

pub fn create_obstacle_deck(rng: &mut impl Rng) -> Vec<ObstacleType> {
    let mut deck = Vec::new();
    for &obstacle in ObstacleType::all() {
        for _ in 0..obstacle.copies() {
            deck.push(obstacle);
        }
    }
    deck.shuffle(rng);
    deck
}

pub fn create_trail_deck(trail_id: Option<&str>) -> Vec<TrailStage> {
    TrailStage::trail_stages(trail_id).to_vec()
}

pub fn create_trail_hazards(rng: &mut impl Rng) -> Vec<TrailHazard> {
    let mut hazards = Vec::new();
    for _ in 0..6 {
        for &hazard_type in TrailHazardType::all() {
            for &row in hazard_type.rows() {
                let dir: i32 = match hazard_type.direction() {
                    "left" => -1,
                    "right" => 1,
                    "random" => if rng.random_bool(0.5) { -1 } else { 1 },
                    _ => 1, // edge/center resolved at runtime
                };
                hazards.push(TrailHazard {
                    hazard_type,
                    target_row: row,
                    push_direction: dir,
                    push_amount: 1,
                });
            }
        }
    }
    hazards.shuffle(rng);
    hazards
}
