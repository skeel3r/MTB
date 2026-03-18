use rand::prelude::*;

use crate::choices::{enumerate_choices, refine_choice};
use crate::engine::{advance_phase, process_action};
use crate::scoring::{compute_heuristic_rewards, compute_terminal_rewards};
use crate::types::*;

/// Run a heuristic-guided rollout from the current state until GameOver or
/// `max_steps`.
///
/// Instead of uniform random play, this rollout uses lightweight heuristics
/// that approximate reasonable play:
/// - Commitment: pro when hand diversity is high and hazard dice are low
/// - Sprint: prefer obstacle matching > steer > pedal > end turn
/// - Stage break: buy cheapest affordable upgrade, then end turn
///
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
            // Non-decision phases: auto-advance
            _ => {
                advance_phase(state, rng);
            }
        }
    }

    // Timeout: use heuristic rewards
    if state.phase == GamePhase::GameOver {
        compute_terminal_rewards(state)
    } else {
        compute_heuristic_rewards(state)
    }
}

/// Dispatch to the right heuristic based on game phase.
fn pick_heuristic(state: &GameState, choices: &[Choice], rng: &mut impl Rng) -> Choice {
    match state.phase {
        GamePhase::Commitment => pick_commitment(state, rng),
        GamePhase::Sprint => pick_sprint_action(state, choices, rng),
        GamePhase::StageBreak => pick_stage_break_action(choices),
        _ => *choices.choose(rng).unwrap(),
    }
}

/// Commitment rollout: 50/50 coin flip.
///
/// Any bias here gets amplified by ISMCTS — if the rollout favors one line,
/// the tree search evaluates the other line in a context where future rounds
/// mostly use the favored line, creating a self-reinforcing signal that
/// pushes commitment to 100% one way. A flat 50/50 lets the tree search
/// discover the right commitment purely from game-state outcomes.
fn pick_commitment(_state: &GameState, rng: &mut impl Rng) -> Choice {
    if rng.random::<f64>() < 0.5 {
        Choice::CommitLine { line: Commitment::Pro }
    } else {
        Choice::CommitLine { line: Commitment::Main }
    }
}

/// Sprint heuristic: weighted selection favoring productive actions.
fn pick_sprint_action(state: &GameState, choices: &[Choice], rng: &mut impl Rng) -> Choice {
    let player = &state.players[state.current_player_index];

    // If dealing with an obstacle, prefer resolve > send_it
    let has_resolve = choices.iter().any(|c| matches!(c, Choice::ResolveObstacle));
    if has_resolve {
        return Choice::ResolveObstacle;
    }
    let has_send = choices.iter().any(|c| matches!(c, Choice::SendIt));
    if has_send && !has_resolve {
        return Choice::SendIt;
    }

    // Weight each action type
    struct Weighted {
        choice: Choice,
        weight: f64,
    }
    let mut weighted: Vec<Weighted> = Vec::new();

    for choice in choices {
        let w = match choice {
            Choice::Pedal => {
                // Pedal more when momentum is low
                if player.momentum < 3 { 4.0 } else { 2.0 }
            }
            Choice::Brake => {
                // Brake when momentum is dangerously high
                let speed_limit = state.active_trail_card
                    .map(|t| t.speed_limit() as i32)
                    .unwrap_or(6);
                if player.momentum > speed_limit + 1 { 5.0 }
                else if player.momentum > speed_limit { 3.0 }
                else { 0.5 }
            }
            Choice::SteerBest => {
                // Steer more when misaligned with trail card
                let misaligned = state.active_trail_card.map(|card| {
                    let rows = card.checked_rows();
                    let lanes = card.target_lanes();
                    let mut count = 0usize;
                    for i in 0..rows.len() {
                        let row = rows[i];
                        let target = lanes[i];
                        if row < player.grid.len() {
                            for c in 0..5 {
                                if player.grid[row][c] {
                                    if (c as i32 - target as i32).unsigned_abs() >= 1 {
                                        count += 1;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    count
                }).unwrap_or(0);
                if misaligned >= 3 { 8.0 }
                else if misaligned >= 1 { 5.0 }
                else { 1.0 }
            }
            Choice::TechniqueBest => 1.5,   // Play cards occasionally
            Choice::DrawObstacle => {
                // Only draw when hand is decent
                if player.hand.len() >= 2 { 2.0 }
                else if player.momentum >= 3 { 1.5 }  // Can Send It
                else { 0.3 }
            }
            Choice::ReuseObstacle { .. } => {
                // Reuse is great — known obstacle
                if player.hand.len() >= 2 { 4.0 } else { 1.0 }
            }
            Choice::FlowSpend { action: FlowAction::Reroll } => {
                if player.hazard_dice >= 3 { 5.0 } else { 1.0 }
            }
            Choice::FlowSpend { .. } => 0.5,
            Choice::EndTurn => {
                // End turn when actions are low or nothing useful
                if player.actions_remaining <= 1 { 2.0 } else { 0.5 }
            }
            _ => 1.0,
        };
        weighted.push(Weighted { choice: *choice, weight: w });
    }

    // Weighted random selection
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

/// Stage break heuristic: buy the best value upgrade, then end turn.
/// Skips Factory Suspension since its value depends on Pro Line commitment
/// which is evaluated separately by the ISMCTS tree.
fn pick_stage_break_action(choices: &[Choice]) -> Choice {
    // Score upgrades by general usefulness (independent of commitment choice)
    let mut best: Option<(Choice, i32)> = None;
    for choice in choices {
        if let Choice::BuyUpgrade { upgrade } = choice {
            use crate::types::UpgradeType::*;
            // Higher score = buy first. Skip Factory Suspension (pro-dependent).
            let score = match upgrade {
                HighEngagementHubs => 10,  // Free first pedal — always useful
                CarbonFrame => 8,          // Min 4 cards + max 12 momentum
                TelemetrySystem => 7,      // Peek at obstacles — strong intel
                ElectronicShifting => 6,   // Free first steer — alignment help
                OversizedRotors => 4,      // Double brake — situational
                FactorySuspension => 0,    // Skip — depends on Pro Line
            };
            if score > 0 && (best.is_none() || score > best.unwrap().1) {
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
