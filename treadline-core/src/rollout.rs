use rand::prelude::*;

use crate::choices::{enumerate_choices, refine_choice};
use crate::engine::{advance_phase, process_action};
use crate::scoring::{compute_heuristic_rewards, compute_terminal_rewards};
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
        GamePhase::Commitment => pick_commitment(state, rng),
        GamePhase::Sprint => pick_sprint_action(state, choices),
        GamePhase::StageBreak => pick_stage_break_action(choices),
        _ => *choices.choose(rng).unwrap(),
    }
}

/// Commitment: context-aware based on game state.
///
/// Late game: pro is increasingly attractive because fewer rounds remain
/// for penalties to compound. On the final round, pro is strictly better
/// (double shred with no future downside from extra hazard dice).
///
/// Risk assessment: pro is safer when hazard dice are low and flow is
/// available for rerolls.
fn pick_commitment(state: &GameState, rng: &mut impl Rng) -> Choice {
    let player = &state.players[state.current_player_index];
    let rounds_remaining = state.trail_length.saturating_sub(state.round);

    // Last round: always pro — no future for penalties to compound
    if rounds_remaining <= 1 {
        return Choice::CommitLine { line: Commitment::Pro };
    }

    // Late game (last 3 rounds): lean toward pro
    // Low hazard dice + flow available = safer to go pro
    let low_risk = player.hazard_dice <= 2 && player.flow >= 2;
    let pro_prob = if rounds_remaining <= 3 && low_risk {
        0.7
    } else if rounds_remaining <= 3 {
        0.55
    } else if low_risk {
        0.5
    } else {
        0.35
    };

    if rng.random::<f64>() < pro_prob {
        Choice::CommitLine { line: Commitment::Pro }
    } else {
        Choice::CommitLine { line: Commitment::Main }
    }
}

/// Count how many checked rows are 2+ columns from their target (hazard die territory).
fn count_danger_rows(player: &PlayerState, state: &GameState) -> usize {
    state.active_trail_card.map(|card| {
        let rows = card.checked_rows();
        let lanes = card.target_lanes();
        let mut count = 0usize;
        for i in 0..rows.len() {
            let row = rows[i];
            let target = lanes[i];
            if row < player.grid.len() {
                for c in 0..5 {
                    if player.grid[row][c] {
                        if (c as i32 - target as i32).unsigned_abs() >= 2 {
                            count += 1;
                        }
                        break;
                    }
                }
            }
        }
        count
    }).unwrap_or(0)
}

/// Sprint heuristic: priority-based decision making.
///
/// Strategy: resolve obstacles when forced, then interleave steering with
/// obstacle drawing throughout the turn. Obstacles cause terrain penalties
/// that push tokens, so steering after obstacles is important.
fn pick_sprint_action(state: &GameState, choices: &[Choice]) -> Choice {
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

    let danger_rows = count_danger_rows(player, state);
    let has_steer = choices.iter().any(|c| matches!(c, Choice::SteerBest));
    

    let has_pedal = choices.iter().any(|c| matches!(c, Choice::Pedal));
    let speed_limit = state.active_trail_card.map(|t| t.speed_limit() as i32).unwrap_or(6);

    // Steer first if any checked row is in hazard die territory (2+ off)
    if has_steer && danger_rows > 0 {
        return Choice::SteerBest;
    }

    // Pedal early when momentum is low — bigger hand next round is high value
    if has_pedal && player.momentum < 3 {
        return Choice::Pedal;
    }

    // Draw/reuse an obstacle if hand can support it
    let can_match_likely = player.hand.len() >= 2;
    let can_send_it = player.momentum >= 2;

    // Reuse (known obstacle) > Draw (blind)
    if can_match_likely || can_send_it {
        for choice in choices {
            if let Choice::ReuseObstacle { .. } = choice {
                return *choice;
            }
        }
        let has_draw = choices.iter().any(|c| matches!(c, Choice::DrawObstacle));
        if has_draw {
            return Choice::DrawObstacle;
        }
    }

    // After drawing obstacles (which may have caused terrain penalties),
    // steer to fix any misalignment — even 1-off matters for perfect alignment / flow
    if has_steer {
        let any_off = state.active_trail_card.map(|card| {
            let rows = card.checked_rows();
            let lanes = card.target_lanes();
            for i in 0..rows.len() {
                let row = rows[i];
                let target = lanes[i];
                if row < player.grid.len() {
                    for c in 0..5 {
                        if player.grid[row][c] {
                            if c != target { return true; }
                            break;
                        }
                    }
                }
            }
            false
        }).unwrap_or(false);
        if any_off {
            return Choice::SteerBest;
        }
    }

    // Pedal if still under speed limit (momentum = cards next round)
    if has_pedal && player.momentum < speed_limit {
        return Choice::Pedal;
    }

    // Brake if over speed limit
    let has_brake = choices.iter().any(|c| matches!(c, Choice::Brake));
    if has_brake && player.momentum > speed_limit {
        return Choice::Brake;
    }

    // Scrub hazard dice
    for choice in choices {
        if matches!(choice, Choice::FlowSpend { action: FlowAction::Scrub }) {
            if player.hazard_dice >= 3 {
                return *choice;
            }
        }
    }

    Choice::EndTurn
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
                FactorySuspension => 3,  // Useful if pro is ever chosen
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
