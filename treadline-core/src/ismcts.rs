use rand::prelude::*;
use rustc_hash::FxHashMap;

use crate::choices::{enumerate_choices, refine_choice};
use crate::determinize::determinize;
use crate::engine::{advance_phase, process_action};
use crate::rollout::rollout;
use crate::scoring::compute_terminal_rewards;
use crate::types::*;

/// Exploration constant for UCB1.
const C: f64 = 0.7;

/// Maximum rollout steps before heuristic timeout.
const MAX_ROLLOUT_STEPS: u32 = 1000;

/// A node in the ISMCTS tree.
pub struct MctsNode {
    pub games: f64,
    pub cumulative_reward: f64,
    pub player_id: usize,
    pub choice: Option<Choice>,
    pub children: FxHashMap<Choice, MctsNode>,
    pub choice_availability_count: FxHashMap<Choice, usize>,
}

impl MctsNode {
    pub fn new(player_id: usize, choice: Option<Choice>) -> Self {
        Self {
            games: 0.0,
            cumulative_reward: 0.0,
            player_id,
            choice,
            children: FxHashMap::default(),
            choice_availability_count: FxHashMap::default(),
        }
    }

    pub fn is_root(&self) -> bool {
        self.choice.is_none()
    }
}

/// Run ISMCTS and return the best choice for `player_index`.
///
/// Uses `RolloutPolicy::Heuristic` by default. Use `ismcts_with_policy` to
/// choose a specific rollout policy.
pub fn ismcts(
    state: &GameState,
    player_index: usize,
    iterations: u32,
    rng: &mut impl Rng,
) -> Choice {
    ismcts_with_policy(state, player_index, iterations, RolloutPolicy::Heuristic, rng)
}

/// Run ISMCTS with a specific rollout policy.
pub fn ismcts_with_policy(
    state: &GameState,
    player_index: usize,
    iterations: u32,
    policy: RolloutPolicy,
    rng: &mut impl Rng,
) -> Choice {
    let mut root = MctsNode::new(player_index, None);

    for _ in 0..iterations {
        let mut det_state = determinize(state, player_index, rng);
        let _rewards = iteration(&mut root, &mut det_state, policy, rng);
    }

    // If no children were expanded (edge case), fall back to first available choice
    if root.children.is_empty() {
        let choices = enumerate_choices(state);
        return choices.into_iter().next().unwrap_or(Choice::EndTurn);
    }

    // Return the most-visited child's choice
    root.children
        .values()
        .max_by(|a, b| a.games.partial_cmp(&b.games).unwrap())
        .and_then(|node| node.choice)
        .unwrap_or(Choice::EndTurn)
}

/// One ISMCTS iteration: select → expand → rollout, then backpropagate.
/// Uses an iterative descent with an explicit path stack instead of recursion
/// to avoid stack overflow at high iteration counts.
fn iteration(
    root: &mut MctsNode,
    state: &mut GameState,
    policy: RolloutPolicy,
    rng: &mut impl Rng,
) -> Vec<f64> {
    // Path of choices taken during descent (for backpropagation)
    let mut path: Vec<Choice> = Vec::new();

    // --- Descent phase: walk down the tree selecting children ---
    let mut current = root as *mut MctsNode;
    loop {
        let node = unsafe { &mut *current };

        // Terminal check
        if state.phase == GamePhase::GameOver {
            let rewards = compute_terminal_rewards(state);
            record_outcome(node, &rewards);
            backpropagate(root, &path, &rewards);
            return rewards;
        }

        // Get legal choices
        let choices = enumerate_choices(state);

        // No choices: advance through non-decision phases
        if choices.is_empty() {
            advance_phase(state, rng);
            advance_to_decision_phase(state, rng);
            continue;
        }

        // Expand
        expand(node, state, &choices, rng);

        // Select best child
        let chosen_choice = select_choice(node, &choices);
        let current_player = state.current_player_index;

        // Refine and apply
        let concrete_choice = refine_choice(state, &chosen_choice, rng);
        process_action(state, current_player, &concrete_choice, rng);
        advance_to_decision_phase(state, rng);

        // Get child
        let child = node.children.get_mut(&chosen_choice).unwrap();

        if child.games == 0.0 {
            // Leaf node: rollout
            let rewards = rollout(state, MAX_ROLLOUT_STEPS, policy, rng);
            record_outcome(child, &rewards);
            record_outcome(node, &rewards);
            backpropagate(root, &path, &rewards);
            return rewards;
        }

        // Internal node: continue descent
        path.push(chosen_choice);
        current = child as *mut MctsNode;
    }
}

/// Walk back up the path and record the outcome at each ancestor.
fn backpropagate(root: &mut MctsNode, path: &[Choice], rewards: &[f64]) {
    record_outcome(root, rewards);
    let mut node = root;
    for choice in path {
        if let Some(child) = node.children.get_mut(choice) {
            record_outcome(child, rewards);
            node = child;
        } else {
            break;
        }
    }
}

/// Expand the node by adding unseen children.
///
/// For root: add all unseen choices as children.
/// For non-root: add one random unseen choice.
/// Always: increment choice_availability_count for each available choice.
fn expand(
    node: &mut MctsNode,
    state: &GameState,
    choices: &[Choice],
    rng: &mut impl Rng,
) {
    let active_player = state.current_player_index;

    // Increment availability counts for all available choices
    for choice in choices {
        *node.choice_availability_count.entry(*choice).or_insert(0) += 1;
    }

    if node.is_root() {
        // Root: add all unseen choices
        for choice in choices {
            if !node.children.contains_key(choice) {
                node.children.insert(
                    *choice,
                    MctsNode::new(active_player, Some(*choice)),
                );
            }
        }
    } else {
        // Non-root: add one random unseen choice
        let mut unseen: Vec<&Choice> = choices
            .iter()
            .filter(|c| !node.children.contains_key(c))
            .collect();

        if !unseen.is_empty() {
            unseen.shuffle(rng);
            let choice = *unseen[0];
            node.children.insert(
                choice,
                MctsNode::new(active_player, Some(choice)),
            );
        }
    }
}

/// Select the child with the highest UCB1 value among available choices.
/// Returns the chosen Choice (we need to look up the child mutably afterward).
fn select_choice(node: &MctsNode, choices: &[Choice]) -> Choice {
    node.children
        .iter()
        .filter(|(choice, _)| choices.contains(choice))
        .max_by(|(_, a), (_, b)| {
            let val_a = ucb1_value(node, a);
            let val_b = ucb1_value(node, b);
            val_a.partial_cmp(&val_b).unwrap()
        })
        .map(|(choice, _)| *choice)
        .unwrap()
}

/// Compute UCB1 value for a child node.
fn ucb1_value(parent: &MctsNode, child: &MctsNode) -> f64 {
    if child.games == 0.0 {
        return f64::MAX;
    }

    let total = if parent.is_root() {
        parent.games
    } else {
        *parent
            .choice_availability_count
            .get(child.choice.as_ref().unwrap())
            .unwrap_or(&1) as f64
    };

    let win_rate = child.cumulative_reward / child.games;
    win_rate + C * (total.ln() / child.games).sqrt()
}

/// Record the outcome at a node (backpropagation).
fn record_outcome(node: &mut MctsNode, rewards: &[f64]) {
    if node.player_id < rewards.len() {
        node.cumulative_reward += rewards[node.player_id];
    }
    node.games += 1.0;
}

/// Advance the game state through non-decision phases until we reach
/// a decision phase (Commitment, Sprint, StageBreak) or GameOver.
fn advance_to_decision_phase(state: &mut GameState, rng: &mut impl Rng) {
    let mut safety = 100;
    loop {
        match state.phase {
            GamePhase::Commitment | GamePhase::Sprint | GamePhase::StageBreak | GamePhase::GameOver => {
                break;
            }
            _ => {
                advance_phase(state, rng);
                safety -= 1;
                if safety <= 0 {
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::init_game;
    use wyrand::WyRand;

    #[test]
    fn test_ismcts_returns_valid_choice() {
        let mut rng = WyRand::new(42);
        let mut state = init_game(2, None, &mut rng);

        // Advance to commitment phase
        advance_phase(&mut state, &mut rng); // scroll_descent
        advance_phase(&mut state, &mut rng); // -> commitment

        assert_eq!(state.phase, GamePhase::Commitment);

        // Run ISMCTS with very few iterations
        let choice = ismcts(&state, 0, 10, &mut rng);

        // Should return a CommitLine choice
        match choice {
            Choice::CommitLine { .. } => {} // expected
            other => panic!("Expected CommitLine, got {:?}", other),
        }
    }

    #[test]
    fn test_ismcts_sprint_choice() {
        let mut rng = WyRand::new(123);
        let mut state = init_game(2, None, &mut rng);

        // Advance to sprint phase
        advance_phase(&mut state, &mut rng); // scroll_descent
        advance_phase(&mut state, &mut rng); // -> commitment

        // Commit both players to main
        process_action(&mut state, 0, &Choice::CommitLine { line: Commitment::Main }, &mut rng);
        process_action(&mut state, 1, &Choice::CommitLine { line: Commitment::Main }, &mut rng);

        advance_phase(&mut state, &mut rng); // environment
        advance_phase(&mut state, &mut rng); // preparation
        advance_phase(&mut state, &mut rng); // -> sprint

        assert_eq!(state.phase, GamePhase::Sprint);

        // Run ISMCTS for sprint decision
        let choice = ismcts(&state, 0, 20, &mut rng);

        // Should be a valid sprint action (not a CommitLine)
        match choice {
            Choice::CommitLine { .. } => panic!("Should not be CommitLine during sprint"),
            _ => {} // any sprint action is fine
        }
    }
}
