use rand::prelude::*;

use crate::types::*;

/// Create a determinized copy of the game state from the perspective of a
/// given player. Hidden information (other players' hands, deck orderings)
/// is randomized while keeping the perspective player's hand intact.
pub fn determinize(state: &GameState, perspective_player: usize, rng: &mut impl Rng) -> GameState {
    let mut det = state.clone();

    // 1. Pool technique cards: deck + discard + all opponents' hands
    let mut pool: Vec<TechniqueCard> = Vec::new();
    pool.extend(det.technique_deck.drain(..));
    pool.extend(det.technique_discard.drain(..));

    // Record opponent hand sizes and collect their cards into the pool
    let mut opponent_hand_sizes: Vec<(usize, usize)> = Vec::new();
    for (i, player) in det.players.iter_mut().enumerate() {
        if i != perspective_player {
            let hand_size = player.hand.len();
            opponent_hand_sizes.push((i, hand_size));
            pool.extend(player.hand.drain(..));
        }
    }

    // Shuffle the pool
    pool.shuffle(rng);

    // 2. Redistribute: give each opponent their original hand size
    for &(player_idx, hand_size) in &opponent_hand_sizes {
        let take = hand_size.min(pool.len());
        det.players[player_idx].hand = pool.drain(..take).collect();
    }

    // Remainder becomes the new technique deck; discard stays empty
    det.technique_deck = pool;

    // 3. Shuffle obstacle deck
    det.obstacle_deck.shuffle(rng);

    // 4. Shuffle penalty deck
    det.penalty_deck.shuffle(rng);

    // 5. Shuffle trail hazards
    det.trail_hazards.shuffle(rng);

    det
}
