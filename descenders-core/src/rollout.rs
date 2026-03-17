use rand::prelude::*;

use crate::choices::enumerate_choices;
use crate::engine::{advance_phase, process_action};
use crate::scoring::{compute_heuristic_rewards, compute_terminal_rewards};
use crate::types::*;

/// Run a random rollout from the current state until GameOver or `max_steps`.
///
/// Returns per-player reward vector.
pub fn rollout(state: &mut GameState, max_steps: u32, rng: &mut impl Rng) -> Vec<f64> {
    let mut steps = 0u32;

    while steps < max_steps {
        match state.phase {
            GamePhase::GameOver => {
                return compute_terminal_rewards(state);
            }
            GamePhase::Commitment => {
                // Randomly choose main or pro for each player via process_action
                // The commitment phase expects one commit_line per player;
                // advance_phase will handle the phase change if needed.
                let choices = enumerate_choices(state);
                if choices.is_empty() {
                    advance_phase(state, rng);
                } else {
                    let choice = *choices.choose(rng).unwrap();
                    let player_idx = state.current_player_index;
                    process_action(state, player_idx, &choice, rng);
                }
                steps += 1;
            }
            GamePhase::Sprint => {
                let choices = enumerate_choices(state);
                if choices.is_empty() {
                    advance_phase(state, rng);
                } else {
                    let choice = *choices.choose(rng).unwrap();
                    let player_idx = state.current_player_index;
                    process_action(state, player_idx, &choice, rng);
                }
                steps += 1;
            }
            GamePhase::StageBreak => {
                let choices = enumerate_choices(state);
                if choices.is_empty() {
                    advance_phase(state, rng);
                } else {
                    let choice = *choices.choose(rng).unwrap();
                    let player_idx = state.current_player_index;
                    process_action(state, player_idx, &choice, rng);
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
