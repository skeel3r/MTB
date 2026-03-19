use rand::prelude::*;

use crate::choices::{enumerate_choices, refine_choice};
use crate::engine::{advance_phase, process_action};
use crate::scoring::{compute_heuristic_rewards, compute_terminal_rewards};
use crate::commitment::choose_commitment;
use crate::types::*;

/// Run a rollout from the current state until GameOver or `max_steps`.
/// Returns per-player reward vector.
pub fn rollout(
    state: &mut GameState,
    max_steps: u32,
    policy: RolloutPolicy,
    rng: &mut impl Rng,
) -> Vec<f64> {
    let mut steps = 0u32;

    while steps < max_steps {
        match state.phase {
            GamePhase::GameOver => {
                return compute_terminal_rewards(state);
            }
            GamePhase::Commitment | GamePhase::Sprint | GamePhase::StageBreak => {
                let choices = enumerate_choices(state);
                if choices.is_empty() {
                    advance_phase(state, rng);
                } else {
                    let choice = match policy {
                        RolloutPolicy::Random => *choices.choose(rng).unwrap(),
                        RolloutPolicy::Heuristic => pick_heuristic(state, &choices, rng),
                    };
                    let concrete = refine_choice(state, &choice, rng);
                    let player_idx = state.current_player_index;
                    process_action(state, player_idx, &concrete, rng);
                }
                steps += 1;
            }
            _ => {
                advance_phase(state, rng);
            }
        }
    }

    if state.phase == GamePhase::GameOver {
        compute_terminal_rewards(state)
    } else {
        compute_heuristic_rewards(state)
    }
}

fn pick_heuristic(state: &GameState, choices: &[Choice], rng: &mut impl Rng) -> Choice {
    match state.phase {
        GamePhase::Commitment => pick_commitment(state),
        GamePhase::Sprint => pick_sprint_action(state, choices, rng),
        GamePhase::StageBreak => pick_stage_break_action(choices),
        _ => *choices.choose(rng).unwrap(),
    }
}

/// Commitment: use the same heuristic as the runner for consistency.
fn pick_commitment(state: &GameState) -> Choice {
    let line = choose_commitment(state, state.current_player_index);
    Choice::CommitLine { line }
}

/// Sprint heuristic: fast weighted-random selection.
///
/// Weights approximate reasonable play without expensive grid scanning.
fn pick_sprint_action(state: &GameState, choices: &[Choice], rng: &mut impl Rng) -> Choice {
    let player = &state.players[state.current_player_index];

    // Forced obstacle resolution — always resolve > send_it
    let has_resolve = choices.iter().any(|c| matches!(c, Choice::ResolveObstacle));
    if has_resolve {
        return Choice::ResolveObstacle;
    }
    let has_send = choices.iter().any(|c| matches!(c, Choice::SendIt));
    if has_send {
        return Choice::SendIt;
    }

    // Weighted random for remaining choices
    struct W { choice: Choice, weight: f64 }
    let mut weighted: Vec<W> = Vec::new();

    let speed_limit = state.active_trail_card.map(|t| t.speed_limit() as i32).unwrap_or(6);

    for choice in choices {
        let w = match choice {
            Choice::Pedal => {
                if player.momentum < 3 { 5.0 }
                else if player.momentum < speed_limit { 3.0 }
                else { 0.5 }
            }
            Choice::Brake => {
                if player.momentum > speed_limit + 1 { 5.0 }
                else if player.momentum > speed_limit { 3.0 }
                else { 0.3 }
            }
            Choice::SteerBest => 4.0,
            Choice::TechniqueBest => 1.5,
            Choice::DrawObstacle => {
                if player.hand.len() >= 2 { 3.0 }
                else if player.momentum >= 2 { 2.0 }
                else { 0.3 }
            }
            Choice::ReuseObstacle { .. } => {
                if player.hand.len() >= 2 { 5.0 } else { 1.5 }
            }
            Choice::FlowSpend { action: FlowAction::Scrub } => {
                if player.hazard_dice >= 4 { 5.0 } else { 0.5 }
            }
            Choice::FlowSpend { .. } => 0.3,
            Choice::EndTurn => {
                if player.actions_remaining == 0 { 3.0 } else { 0.3 }
            }
            _ => 1.0,
        };
        weighted.push(W { choice: *choice, weight: w });
    }

    let total: f64 = weighted.iter().map(|w| w.weight).sum();
    if total <= 0.0 {
        return *choices.choose(rng).unwrap();
    }
    let mut roll = rng.random::<f64>() * total;
    for w in &weighted {
        roll -= w.weight;
        if roll <= 0.0 {
            return w.choice;
        }
    }
    weighted.last().unwrap().choice
}

/// Stage break: buy upgrades by value score, then end turn.
fn pick_stage_break_action(choices: &[Choice]) -> Choice {
    let mut best: Option<(Choice, i32)> = None;
    for choice in choices {
        if let Choice::BuyUpgrade { upgrade } = choice {
            use crate::types::UpgradeType::*;
            let score = match upgrade {
                HighEngagementHubs => 10,
                CarbonFrame => 8,
                TelemetrySystem => 7,
                ElectronicShifting => 6,
                OversizedRotors => 4,
                FactorySuspension => 3,
            };
            if best.is_none() || score > best.unwrap().1 {
                best = Some((*choice, score));
            }
        }
    }

    if let Some((choice, _)) = best {
        choice
    } else {
        Choice::EndTurn
    }
}
