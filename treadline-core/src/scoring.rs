use crate::types::*;

/// Compute terminal rewards for each player based on final standings.
///
/// Ranking (higher is better except penalties):
/// 1. Most shred (win condition)
/// 2. Most flow
/// 3. Fewest penalties
/// 4. Most momentum
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
    let mut indexed: Vec<(usize, (i32, i32, i32, i32))> = state
        .players
        .iter()
        .enumerate()
        .map(|(i, p)| {
            (
                i,
                (
                    p.shred,
                    p.flow,
                    -(p.penalties.len() as i32), // fewer is better => negate
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
/// Includes alignment quality so the ISMCTS can see immediate value from
/// steering: tokens closer to target lanes score higher, which propagates
/// back through the tree to make steer actions look valuable.
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
            let mut score = (p.shred as f64) * 8.0
                + (p.obstacles_cleared as f64) * 2.0
                + 0.1 * (p.momentum as f64)
                + 0.15 * (p.flow as f64)
                - 0.5 * (p.penalties.len() as f64)
                - 0.3 * (p.hazard_dice as f64);

            // Alignment quality: score grid position against active trail card
            if let Some(card) = &state.active_trail_card {
                let checked_rows = card.checked_rows();
                let target_lanes = card.target_lanes();
                for i in 0..checked_rows.len() {
                    let row = checked_rows[i];
                    if row < p.grid.len() {
                        if let Some(col) = p.grid[row].iter().position(|&v| v) {
                            let dist = (col as i32 - target_lanes[i] as i32).unsigned_abs();
                            match dist {
                                0 => score += 0.8,  // perfect — will earn flow
                                1 => score += 0.3,  // close — no hazard die
                                _ => score -= 0.5,  // 2+ off — will cause hazard die
                            }
                        }
                    }
                }
            }

            score
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
