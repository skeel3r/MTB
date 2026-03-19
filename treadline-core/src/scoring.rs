use crate::types::*;

/// Compute terminal rewards for each player.
///
/// Blends ordinal ranking (position-based) with a continuous margin
/// component (shred difference). This ensures the ISMCTS can see the
/// value of gaining extra shred even when it doesn't change ranking —
/// critical for evaluating Pro Line's doubled shred.
///
/// Reward = 0.6 * rank_reward + 0.4 * margin_reward
///
/// Ranking tiebreakers: shred → flow → -penalties → momentum
pub fn compute_terminal_rewards(state: &GameState) -> Vec<f64> {
    let n = state.players.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![1.0];
    }

    // ── Ordinal ranking component (position-based) ──
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
                    -(p.penalties.len() as i32),
                    p.momentum,
                ),
            )
        })
        .collect();

    indexed.sort_by(|a, b| b.1.cmp(&a.1));

    let mut rank_rewards = vec![0.0_f64; n];
    let mut i = 0;
    while i < n {
        let mut j = i + 1;
        while j < n && indexed[j].1 == indexed[i].1 {
            j += 1;
        }
        let mut total_reward = 0.0;
        for pos in i..j {
            total_reward += 1.0 - (pos as f64) / ((n - 1) as f64);
        }
        let avg_reward = total_reward / (j - i) as f64;
        for pos in i..j {
            rank_rewards[indexed[pos].0] = avg_reward;
        }
        i = j;
    }

    // ── Continuous margin component (shred-based) ──
    // Normalize shred to [0, 1] via min-max so each extra point of shred
    // contributes proportionally to the reward.
    let shreds: Vec<f64> = state.players.iter().map(|p| p.shred as f64).collect();
    let min_shred = shreds.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_shred = shreds.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let shred_range = max_shred - min_shred;

    let margin_rewards: Vec<f64> = if shred_range > 0.0 {
        shreds.iter().map(|&s| (s - min_shred) / shred_range).collect()
    } else {
        vec![0.5; n]
    };

    // ── Blend: 60% ranking + 40% margin ──
    let mut rewards = vec![0.0_f64; n];
    for i in 0..n {
        rewards[i] = 0.6 * rank_rewards[i] + 0.4 * margin_rewards[i];
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
