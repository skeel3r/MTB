use crate::types::*;

/// Compute terminal rewards for each player based on final standings.
///
/// Ranking tiebreakers (higher is better except penalties):
/// 1. Most shred
/// 2. Most obstacles_cleared
/// 3. Most perfect_matches
/// 4. Fewest penalties (penalties.len())
/// 5. Most flow
/// 6. Most momentum
///
/// Rewards: 1st place = 1.0, last place = 0.0, linear interpolation for
/// middle places. Tied players share their averaged reward.
pub fn compute_terminal_rewards(state: &GameState) -> Vec<f64> {
    let n = state.players.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![1.0];
    }

    // Build sort keys for each player (higher = better for all fields)
    // For penalties, negate so "fewer" is "higher"
    let mut indexed: Vec<(usize, (i32, i32, i32, i32, i32, i32))> = state
        .players
        .iter()
        .enumerate()
        .map(|(i, p)| {
            (
                i,
                (
                    p.shred,
                    p.obstacles_cleared,
                    p.perfect_matches,
                    -(p.penalties.len() as i32), // fewer is better => negate
                    p.flow,
                    p.momentum,
                ),
            )
        })
        .collect();

    // Sort descending by sort key (best first)
    indexed.sort_by(|a, b| b.1.cmp(&a.1));

    // Assign ranks with tie handling
    let mut rewards = vec![0.0_f64; n];
    let mut i = 0;
    while i < n {
        // Find the extent of the tie group
        let mut j = i + 1;
        while j < n && indexed[j].1 == indexed[i].1 {
            j += 1;
        }

        // Positions i..j share the same rank. Average the rewards for those
        // positions. Position 0 gets reward 1.0, position n-1 gets 0.0.
        let mut total_reward = 0.0;
        for pos in i..j {
            total_reward += if n == 1 {
                1.0
            } else {
                1.0 - (pos as f64) / ((n - 1) as f64)
            };
        }
        let avg_reward = total_reward / (j - i) as f64;

        for pos in i..j {
            let player_idx = indexed[pos].0;
            rewards[player_idx] = avg_reward;
        }

        i = j;
    }

    rewards
}

/// Compute heuristic rewards for rollout timeout (game not finished).
///
/// Per-player score uses `progress` as the primary metric (which captures
/// the Pro Line's doubled progress per obstacle clear) and penalizes risk
/// accumulation. This ensures the ISMCTS can distinguish between the value
/// of Main Line (steady +1) and Pro Line (+2 but riskier).
///
/// Then normalize to [0, 1] via min-max normalization.
pub fn compute_heuristic_rewards(state: &GameState) -> Vec<f64> {
    let n = state.players.len();
    if n == 0 {
        return Vec::new();
    }

    let scores: Vec<f64> = state
        .players
        .iter()
        .map(|p| {
            (p.shred as f64) * 8.0
                + (p.obstacles_cleared as f64) * 2.0
                + 0.1 * (p.momentum as f64)
                + 0.15 * (p.flow as f64)
                - 0.5 * (p.penalties.len() as f64)
                - 0.3 * (p.hazard_dice as f64)
        })
        .collect();

    if n == 1 {
        return vec![1.0];
    }

    let min_score = scores.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_score = scores.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    let range = max_score - min_score;
    if range < 1e-9 {
        // All scores identical — everyone gets 0.5
        return vec![0.5; n];
    }

    scores.iter().map(|&s| (s - min_score) / range).collect()
}
