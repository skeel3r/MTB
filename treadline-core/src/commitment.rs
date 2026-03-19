use crate::types::*;

/// Choose commitment (Main vs Pro) using a direct heuristic evaluation.
///
/// Pro Line gives +2 shred per obstacle clear (vs +1 on Main) but adds
/// +1 extra hazard die per Send It. The decision depends on:
///
/// - **Rounds remaining**: Late game = less time for penalties to compound.
///   Last round = pro is always correct (no future downside).
/// - **Hand quality**: More cards = more likely to match obstacles with cards
///   instead of Send It, avoiding the extra hazard die entirely.
/// - **Hazard dice**: High hazard = closer to crash threshold, risky to add more.
/// - **Flow available**: Flow enables rerolls during reckoning, mitigating risk.
/// - **Position**: Behind in shred = more incentive to take the risk for double reward.
pub fn choose_commitment(state: &GameState, player_index: usize) -> Commitment {
    let player = &state.players[player_index];
    let rounds_remaining = state.trail_length.saturating_sub(state.round);

    // Last round: always pro — zero future downside
    if rounds_remaining <= 1 {
        return Commitment::Pro;
    }

    // Score pro vs main. Positive = favor pro, negative = favor main.
    let mut pro_score: f64 = 0.0;

    // Late game bonus: penalties have less time to compound
    pro_score += match rounds_remaining {
        2 => 3.0,
        3 => 2.0,
        4..=5 => 1.0,
        _ => 0.0,
    };

    // Hand quality: more cards = better chance of card-matching (no Send It penalty)
    // With 3+ cards, most single-symbol obstacles are matchable
    let hand_size = player.hand.len();
    pro_score += match hand_size {
        0..=1 => -2.0,  // Very likely to Send It
        2 => -0.5,
        3..=4 => 1.0,
        _ => 2.0,       // 5+ cards = excellent matching odds
    };

    // Hazard dice risk: high dice = close to crash threshold (6)
    pro_score += match player.hazard_dice {
        0 => 1.5,
        1 => 0.5,
        2 => -0.5,
        3 => -2.0,
        _ => -4.0,      // 4+ dice = one bad Send It away from crash
    };

    // Flow available for rerolls: each flow token can reroll one 6
    if player.flow >= 3 {
        pro_score += 1.0;
    } else if player.flow >= 1 {
        pro_score += 0.5;
    }

    // Position: behind = more incentive to risk for double reward
    let avg_shred = state.players.iter().map(|p| p.shred as f64).sum::<f64>()
        / state.players.len() as f64;
    let behind = avg_shred - player.shred as f64;
    if behind > 5.0 {
        pro_score += 2.0;  // Significantly behind — need to catch up
    } else if behind > 2.0 {
        pro_score += 1.0;
    } else if behind < -3.0 {
        pro_score -= 1.0;  // Comfortably ahead — play safe
    }

    // Momentum: higher momentum = more Send It fuel, but also means
    // bigger hand next round (already counted in hand_size for current round)
    if player.momentum >= 4 {
        pro_score += 0.5;  // Can Send It through tough obstacles if needed
    }

    if pro_score > 0.0 {
        Commitment::Pro
    } else {
        Commitment::Main
    }
}
