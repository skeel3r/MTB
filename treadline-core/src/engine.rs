use rand::prelude::*;
use rand::RngExt;
use std::collections::HashMap;
use std::collections::VecDeque;

use crate::cards::*;
use crate::types::*;

// ── Grid helpers ──

/// Find column of token in a grid row. Returns None if no token.
pub fn get_token_col(grid: &[Vec<bool>], row: usize) -> Option<usize> {
    if row >= grid.len() {
        return None;
    }
    for c in 0..5 {
        if grid[row][c] {
            return Some(c);
        }
    }
    None
}

/// Clear row and set token at col (clamped to 0..=4).
pub fn set_token(grid: &mut [Vec<bool>], row: usize, col: usize) {
    if row >= grid.len() {
        return;
    }
    for c in 0..5 {
        grid[row][c] = false;
    }
    let clamped = col.min(4);
    grid[row][clamped] = true;
}

/// Set token at a signed column position, clamping to 0..=4.
fn set_token_signed(grid: &mut [Vec<bool>], row: usize, col: i32) {
    let clamped = col.max(0).min(4) as usize;
    set_token(grid, row, clamped);
}

/// Move token 1 step toward col 2 (center).
pub fn shift_toward_center(grid: &mut [Vec<bool>], row: usize) {
    if let Some(col) = get_token_col(grid, row) {
        let dir = if col > 2 {
            -1i32
        } else if col < 2 {
            1
        } else {
            0
        };
        if dir != 0 {
            set_token_signed(grid, row, col as i32 + dir);
        }
    }
}

/// Move token 1 step away from center (col 2).
fn shift_away_from_center(grid: &mut [Vec<bool>], row: usize) {
    if let Some(col) = get_token_col(grid, row) {
        let dir = if col >= 2 { 1i32 } else { -1 };
        set_token_signed(grid, row, col as i32 + dir);
    }
}

// ── Tracking helpers ──

fn track_upgrade_activation(player: &mut PlayerState, upgrade: UpgradeType) {
    if let Some(entry) = player.upgrade_activations.iter_mut().find(|(u, _)| *u == upgrade) {
        entry.1 += 1;
    } else {
        player.upgrade_activations.push((upgrade, 1));
    }
}

// ── Crash ──

/// Crash a player: reset grid to center, lose 3 momentum, draw penalty, end turn.
pub fn crash(
    player: &mut PlayerState,
    penalty_deck: &mut VecDeque<PenaltyType>,
    _rng: &mut impl Rng,
) {
    // Reset grid: rows 0-4 at col 2, row 5 cleared
    for r in 0..6 {
        for c in 0..5 {
            player.grid[r][c] = false;
        }
        player.grid[r][2] = true;
    }
    player.momentum = (player.momentum - 3).max(0);
    if let Some(pen) = penalty_deck.pop_front() {
        player.penalties.push(pen);
    }
    player.crashed = true;
    player.turn_ended = true;
}

// ── Card drawing ──

fn draw_cards(state: &mut GameState, count: usize) -> Vec<TechniqueType> {
    let mut cards = Vec::new();
    for _ in 0..count {
        if state.technique_deck.is_empty() {
            if !state.technique_discard.is_empty() {
                state.technique_deck.append(&mut state.technique_discard);
            }
        }
        if let Some(card) = state.technique_deck.pop_front() {
            cards.push(card);
        }
    }
    cards
}

fn draw_cards_with_rng(state: &mut GameState, count: usize, rng: &mut impl Rng) -> Vec<TechniqueType> {
    let mut cards = Vec::new();
    for _ in 0..count {
        if state.technique_deck.is_empty() {
            if !state.technique_discard.is_empty() {
                state.technique_deck.append(&mut state.technique_discard);
                state.technique_deck.make_contiguous().shuffle(rng);
            }
        }
        if let Some(card) = state.technique_deck.pop_front() {
            cards.push(card);
        }
    }
    cards
}

// ── Obstacle matching ──

/// Find card indices that match an obstacle.
/// Returns Some(indices) if match is possible, None otherwise.
/// "Forced Through": any 2 cards of the same symbol substitute for 1 card of any symbol.
pub fn find_obstacle_match(
    hand: &[TechniqueType],
    obstacle: &ObstacleType,
) -> Option<Vec<usize>> {
    let mode = obstacle.match_mode();

    if mode == MatchMode::Any {
        // Need ONE matching symbol - try exact first
        for sym in obstacle.symbols() {
            if let Some(idx) = hand.iter().position(|c| c.symbol() == *sym) {
                return Some(vec![idx]);
            }
        }
        // Try wild: any 2 cards of the same symbol
        let mut symbol_groups: HashMap<CardSymbol, Vec<usize>> = HashMap::new();
        for (i, card) in hand.iter().enumerate() {
            symbol_groups.entry(card.symbol()).or_default().push(i);
        }
        for indices in symbol_groups.values() {
            if indices.len() >= 2 {
                return Some(vec![indices[0], indices[1]]);
            }
        }
        return None;
    }

    // mode == MatchMode::All: need every required symbol
    let mut used_indices = Vec::new();
    let mut matched_indices = Vec::new();
    let mut unmatched_symbols = Vec::new();

    // Pass 1: exact matches
    for sym in obstacle.symbols() {
        let mut found = false;
        for (i, card) in hand.iter().enumerate() {
            if card.symbol() == *sym && !used_indices.contains(&i) {
                matched_indices.push(i);
                used_indices.push(i);
                found = true;
                break;
            }
        }
        if !found {
            unmatched_symbols.push(*sym);
        }
    }

    if unmatched_symbols.is_empty() {
        return Some(matched_indices);
    }

    // Pass 2: "Forced Through" - use 2 same-symbol cards as wild for each unmatched symbol
    for _ in &unmatched_symbols {
        let mut available: HashMap<CardSymbol, Vec<usize>> = HashMap::new();
        for (i, card) in hand.iter().enumerate() {
            if !used_indices.contains(&i) {
                available.entry(card.symbol()).or_default().push(i);
            }
        }

        let mut found = false;
        for indices in available.values() {
            if indices.len() >= 2 {
                matched_indices.push(indices[0]);
                matched_indices.push(indices[1]);
                used_indices.push(indices[0]);
                used_indices.push(indices[1]);
                found = true;
                break;
            }
        }

        if !found {
            return None;
        }
    }

    Some(matched_indices)
}

// ── Obstacle terrain penalty ──

pub fn apply_obstacle_terrain_penalty(
    state: &mut GameState,
    player_index: usize,
    obstacle: &ObstacleType,
    rng: &mut impl Rng,
) {
    let player = &mut state.players[player_index];

    match obstacle.penalty_effect() {
        PenaltyEffect::SlideOut => {
            // Row 1 (index 0) token shifts 2 lanes randomly
            if let Some(col) = get_token_col(&player.grid, 0) {
                let dir: i32 = if rng.random_bool(0.5) { -2 } else { 2 };
                set_token_signed(&mut player.grid, 0, col as i32 + dir);
            }
        }
        PenaltyEffect::HeavyDrag => {
            // Lose 2 Momentum and 1 card from hand
            player.momentum = (player.momentum - 2).max(0);
            if !player.hand.is_empty() {
                let discard_idx = rng.random_range(0..player.hand.len());
                let discarded = player.hand.remove(discard_idx);
                state.technique_discard.push_back(discarded);
            }
        }
        PenaltyEffect::CaseIt => {
            // Lose 2 Momentum immediately
            let player = &mut state.players[player_index];
            player.momentum = (player.momentum - 2).max(0);
        }
        PenaltyEffect::BottomOut => {
            // Take 2 Hazard Dice instead of the normal 1 (1 already added in send_it, add 1 more)
            state.players[player_index].hazard_dice += 1;
        }
        PenaltyEffect::WideTurn => {
            // Row 1 (index 0) shifts 1 lane away from center
            shift_away_from_center(&mut state.players[player_index].grid, 0);
        }
        PenaltyEffect::Whiplash => {
            // Shift Row 2 and Row 3 (indices 1, 2) one lane right
            for r in [1, 2] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 + 1);
                }
            }
        }
        PenaltyEffect::Stall => {
            // Cannot Pedal this turn
            state.players[player_index].cannot_pedal = true;
        }
        PenaltyEffect::Locked => {
            // Simplified: shift row 0 to center
            set_token(&mut state.players[player_index].grid, 0, 2);
        }
        PenaltyEffect::Wipeout => {
            // Take 2 Hazard Dice (1 extra) and end turn immediately
            let player = &mut state.players[player_index];
            player.hazard_dice += 1;
            player.turn_ended = true;
        }
        PenaltyEffect::WashOut => {
            // Shift Row 1 and Row 2 (indices 0, 1) three lanes (random direction)
            let dir: i32 = if rng.random_bool(0.5) { -3 } else { 3 };
            for r in [0, 1] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 + dir);
                }
            }
        }
        PenaltyEffect::FullSend => {
            // Shift Rows 1 and 2 (indices 0, 1) two lanes away from center
            for r in [0, 1] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    let dir: i32 = if col >= 2 { 2 } else { -2 };
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 + dir);
                }
            }
        }
        PenaltyEffect::Pinball => {
            // Shift Rows 1-3 (indices 0-2) one lane away from center
            for r in [0, 1, 2] {
                shift_away_from_center(&mut state.players[player_index].grid, r);
            }
        }
        PenaltyEffect::Tangled => {
            // Shift Rows 2-4 (indices 1-3) one lane left
            for r in [1, 2, 3] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 - 1);
                }
            }
        }
        PenaltyEffect::Overshoot => {
            // Shift Row 1 (index 0) two lanes and Row 3 (index 2) one lane away from center
            if let Some(col) = get_token_col(&state.players[player_index].grid, 0) {
                let dir: i32 = if col >= 2 { 2 } else { -2 };
                set_token_signed(&mut state.players[player_index].grid, 0, col as i32 + dir);
            }
            shift_away_from_center(&mut state.players[player_index].grid, 2);
        }
    }
}

// ── Reveal obstacle helper ──

fn reveal_obstacle(state: &mut GameState, player_id: &str, obstacle: ObstacleType) {
    state
        .player_obstacle_lines
        .entry(player_id.to_string())
        .or_default()
        .push(obstacle);
    state.round_revealed_obstacles.push(obstacle);
}

// ── Standings ──

/// Get standings sorted by tiebreaker order. Returns vec of (original_index, reference).
pub fn get_standings(state: &GameState) -> Vec<(usize, &PlayerState)> {
    let mut indexed: Vec<(usize, &PlayerState)> = state.players.iter().enumerate().collect();
    indexed.sort_by(|(_, a), (_, b)| {
        b.shred
            .cmp(&a.shred)
            .then(b.obstacles_cleared.cmp(&a.obstacles_cleared))
            .then(b.perfect_matches.cmp(&a.perfect_matches))
            .then(a.penalties.len().cmp(&b.penalties.len()))
            .then(b.flow.cmp(&a.flow))
            .then(b.momentum.cmp(&a.momentum))
    });
    indexed
}

// ── Initialize game ──

pub fn init_game(
    player_count: usize,
    trail_id: Option<&str>,
    rng: &mut impl Rng,
) -> GameState {
    let mut technique_deck: VecDeque<TechniqueType> = VecDeque::from(create_technique_deck(rng));

    let mut players = Vec::new();
    for i in 0..player_count {
        // 6x5 grid, tokens in column 2 for rows 0-4
        let mut grid = vec![vec![false; 5]; 6];
        for row in 0..5 {
            grid[row][2] = true;
        }

        // Earlier players get more starting cards
        let starting_cards = (player_count - i).max(1);
        let hand: Vec<TechniqueType> = technique_deck
            .drain(..starting_cards.min(technique_deck.len()))
            .collect();

        players.push(PlayerState {
            id: format!("player-{}", i),
            name: format!("Player {}", i + 1),
            grid,
            momentum: 2,
            flow: 0,
            shred: 0,
            hand,
            penalties: Vec::new(),
            hazard_dice: 0,
            actions_remaining: 5,
            commitment: Commitment::Main,
            perfect_matches: 0,
            obstacles_cleared: 0,
            crashed: false,
            turn_ended: false,
            upgrades: Vec::new(),
            cannot_pedal: false,
            cannot_brake: false,
            total_cards_played: 0,
            drew_fresh_obstacle: false,
            trail_read_committed_player: None,
            trail_read_next_index: 0,
            pending_momentum: 0,
            upgrade_activations: Vec::new(),
            flow_from_alignment: 0,
            flow_from_other: 0,
            flow_spent_upgrades: 0,
            flow_spent_abilities: 0,
            hazard_from_misalignment: 0,
            alignment_checks: 0,
            alignment_hits: 0,
        });
    }

    let trail_stages = TrailStage::trail_stages(trail_id);
    let trail_length = trail_stages.len() as u32;
    let mut trail_deck: VecDeque<TrailStage> = VecDeque::from(trail_stages.to_vec());
    let queued_trail_card = trail_deck.pop_front();

    GameState {
        players,
        current_player_index: 0,
        round: 0,
        trail_length,
        trail_id: trail_id.unwrap_or("whistler-a-line").to_string(),
        phase: GamePhase::Setup,
        active_trail_card: None,
        queued_trail_card,
        trail_deck,
        technique_deck,
        technique_discard: VecDeque::new(),
        penalty_deck: VecDeque::from(create_penalty_deck(rng)),
        obstacle_deck: VecDeque::from(create_obstacle_deck(rng)),
        obstacle_discard: VecDeque::new(),
        active_obstacles: Vec::new(),
        trail_hazards: VecDeque::from(create_trail_hazards(rng)),
        current_hazards: Vec::new(),
        player_obstacle_lines: HashMap::new(),
        round_revealed_obstacles: Vec::new(),
        last_hazard_rolls: Vec::new(),
        log: Vec::new(),
    }
}

// ── Process player action during Sprint ──

pub fn process_action(
    state: &mut GameState,
    player_index: usize,
    choice: &Choice,
    rng: &mut impl Rng,
) {
    // Skip crashed/turn_ended check for stage break actions (buy upgrades, end turn)
    let is_stage_break_action = matches!(choice, Choice::BuyUpgrade { .. } | Choice::EndTurn | Choice::CommitLine { .. });
    if !is_stage_break_action {
        let player = &state.players[player_index];
        if player.crashed || player.turn_ended {
            return;
        }
    }

    match choice {
        Choice::Pedal => {
            {
                let player = &mut state.players[player_index];
                if player.cannot_pedal {
                    return;
                }
                let max_actions = if player.penalties.contains(&PenaltyType::ArmPump) { 3 } else { 5 };
                let free_pedal = player.upgrades.contains(&UpgradeType::HighEngagementHubs)
                    && player.actions_remaining == max_actions;
                if !free_pedal {
                    if player.actions_remaining < 1 {
                        return;
                    }
                    player.actions_remaining -= 1;
                } else {
                    track_upgrade_activation(player, UpgradeType::HighEngagementHubs);
                }
            }
            let player = &mut state.players[player_index];
            let max_momentum = if player.penalties.contains(&PenaltyType::DroppedChain) {
                2
            } else if player.upgrades.contains(&UpgradeType::CarbonFrame) {
                12
            } else {
                8
            };
            player.momentum = (player.momentum + 1).min(max_momentum);
        }

        Choice::Brake => {
            let player = &mut state.players[player_index];
            if player.cannot_brake {
                return;
            }
            if player.actions_remaining < 1 {
                return;
            }
            player.actions_remaining -= 1;

            let has_rotors = player.upgrades.contains(&UpgradeType::OversizedRotors);
            let reduction = if has_rotors { 2 } else { 1 };
            player.momentum = (player.momentum - reduction).max(0);
            if has_rotors {
                track_upgrade_activation(player, UpgradeType::OversizedRotors);
            }
        }

        Choice::Steer { row, direction } => {
            let row = *row;
            let direction = *direction;

            let player = &mut state.players[player_index];

            // "Stretched Cable" penalty: must discard 1 card to steer
            if player.penalties.contains(&PenaltyType::StretchedCable) {
                if player.hand.is_empty() {
                    return; // Can't steer without cards
                }
                let discarded = player.hand.remove(0);
                state.technique_discard.push_back(discarded);
            }

            {
                let player = &mut state.players[player_index];
                let max_actions = if player.penalties.contains(&PenaltyType::ArmPump) { 3 } else { 5 };
                let free_steer = player.upgrades.contains(&UpgradeType::ElectronicShifting)
                    && player.actions_remaining == max_actions;
                if !free_steer {
                    if player.actions_remaining < 1 {
                        return;
                    }
                    player.actions_remaining -= 1;
                } else {
                    track_upgrade_activation(player, UpgradeType::ElectronicShifting);
                }
            }

            let player = &mut state.players[player_index];
            if let Some(col) = get_token_col(&player.grid, row) {
                set_token_signed(&mut player.grid, row, col as i32 + direction);
            }

            // "Bent Bars" penalty: rows 2-3 (0-indexed) move together
            if player.penalties.contains(&PenaltyType::BentBars) {
                let other_row = if row == 2 { 3 } else if row == 3 { 2 } else { usize::MAX };
                if other_row < 6 {
                    if let Some(col) = get_token_col(&player.grid, other_row) {
                        set_token_signed(&mut player.grid, other_row, col as i32 + direction);
                    }
                }
            }

            // "Loose Headset" penalty: +1 hazard die per steer
            if player.penalties.contains(&PenaltyType::LooseHeadset) {
                player.hazard_dice += 1;
            }
        }

        Choice::Technique { card_index } => {
            let card_index = *card_index;
            {
                let player = &state.players[player_index];
                if player.actions_remaining < 1 {
                    return;
                }
                if card_index >= player.hand.len() {
                    return;
                }
            }

            let card = state.players[player_index].hand.remove(card_index);
            state.players[player_index].actions_remaining -= 1;
            state.players[player_index].total_cards_played += 1;

            // Apply card effects
            match card {
                TechniqueType::InsideLine => {
                    // Shift row 0 token toward center by up to 2
                    if let Some(col) = get_token_col(&state.players[player_index].grid, 0) {
                        let dir = if col > 2 {
                            -(2i32.min(col as i32 - 2))
                        } else if col < 2 {
                            2i32.min(2 - col as i32)
                        } else {
                            0
                        };
                        if dir != 0 {
                            set_token_signed(
                                &mut state.players[player_index].grid,
                                0,
                                col as i32 + dir,
                            );
                        }
                    }
                }
                TechniqueType::Manual => {
                    // Swap row 0 and row 1 tokens
                    let col0 = get_token_col(&state.players[player_index].grid, 0);
                    let col1 = get_token_col(&state.players[player_index].grid, 1);
                    if let (Some(c0), Some(c1)) = (col0, col1) {
                        set_token(&mut state.players[player_index].grid, 0, c1);
                        set_token(&mut state.players[player_index].grid, 1, c0);
                    }
                }
                TechniqueType::Flick => {
                    // Shift tokens in rows 0-2 one lane toward center
                    for r in 0..=2 {
                        shift_toward_center(&mut state.players[player_index].grid, r);
                    }
                }
                TechniqueType::Recover => {
                    // Remove 2 hazard dice (min 0). Center row 0.
                    let player = &mut state.players[player_index];
                    player.hazard_dice = (player.hazard_dice - 2).max(0);
                    // Center row 0
                    set_token(&mut player.grid, 0, 2);
                }
                TechniqueType::Pump => {
                    // Shift tokens in rows 3-5 one lane toward center
                    for r in 3..=5 {
                        shift_toward_center(&mut state.players[player_index].grid, r);
                    }
                }
                TechniqueType::Whip => {
                    // Move row 0 token to center for simplicity
                    set_token(&mut state.players[player_index].grid, 0, 2);
                }
            }

            // Discard the card
            state.technique_discard.push_back(card);
        }

        Choice::DrawObstacle => {
            // Free action - no action cost
            state.players[player_index].drew_fresh_obstacle = true;

            if state.obstacle_deck.is_empty() {
                if !state.obstacle_discard.is_empty() {
                    state.obstacle_deck.append(&mut state.obstacle_discard);
                    state.obstacle_deck.make_contiguous().shuffle(rng);
                }
            }
            if let Some(drawn) = state.obstacle_deck.pop_front() {
                state.active_obstacles.push(drawn);
            }
        }

        Choice::ReuseObstacle { revealed_index } => {
            // Trail Read: tackle next obstacle in a specific player's line, in order.
            // revealed_index is the player index whose line to follow.
            let target_player_idx = *revealed_index;
            let player = &state.players[player_index];

            if player.drew_fresh_obstacle {
                return;
            }

            // Check if already committed to a different player's line
            if let Some(committed) = player.trail_read_committed_player {
                if committed != target_player_idx {
                    return; // Can't switch lines
                }
            }

            // Can't follow your own line
            if target_player_idx == player_index {
                return;
            }

            // Get the target player's obstacle line
            let target_id = &state.players[target_player_idx].id.clone();
            let line = match state.player_obstacle_lines.get(target_id) {
                Some(line) => line.clone(),
                None => return,
            };

            let next_idx = state.players[player_index].trail_read_next_index;
            if next_idx >= line.len() {
                return; // No more obstacles in this line
            }

            let reused = line[next_idx];
            state.players[player_index].trail_read_committed_player = Some(target_player_idx);
            state.players[player_index].trail_read_next_index = next_idx + 1;
            state.active_obstacles.push(reused);
        }

        Choice::ResolveObstacle => {
            // Free action. Try to match active_obstacles[0] with hand cards.
            if state.active_obstacles.is_empty() {
                return;
            }
            let obstacle = state.active_obstacles[0];

            // Step 1: Terrain effect ALWAYS fires
            apply_obstacle_terrain_penalty(state, player_index, &obstacle, rng);

            // Step 2: Try to match with cards
            let match_indices = find_obstacle_match(&state.players[player_index].hand, &obstacle);

            if let Some(indices) = match_indices {
                // Discard matching cards (sort descending to remove safely)
                let mut sorted_indices = indices;
                sorted_indices.sort_unstable_by(|a, b| b.cmp(a));
                for idx in sorted_indices {
                    let removed = state.players[player_index].hand.remove(idx);
                    state.technique_discard.push_back(removed);
                }

                let shred_gain = if state.players[player_index].commitment == Commitment::Pro {
                    2
                } else {
                    1
                };
                let player = &mut state.players[player_index];
                player.shred += shred_gain;
                player.pending_momentum += 1;
                player.obstacles_cleared += 1;
                player.perfect_matches += 1;
                // Factory Suspension: Pro Line obstacle clears gain +2 Flow
                if player.commitment == Commitment::Pro
                    && player.upgrades.contains(&UpgradeType::FactorySuspension)
                {
                    player.flow += 2;
                    player.flow_from_other += 2;
                    track_upgrade_activation(player, UpgradeType::FactorySuspension);
                }
            } else {
                // Can't match - crash
                crash(
                    &mut state.players[player_index],
                    &mut state.penalty_deck,
                    rng,
                );
            }

            // Remove obstacle from active, add to discard and revealed
            let removed_obstacle = state.active_obstacles.remove(0);
            let player_id = state.players[player_index].id.clone();
            state.obstacle_discard.push_back(removed_obstacle);
            reveal_obstacle(state, &player_id, removed_obstacle);

            // Crash check from terrain effect accumulating hazard dice
            if !state.players[player_index].crashed && state.players[player_index].hazard_dice >= 6
            {
                crash(
                    &mut state.players[player_index],
                    &mut state.penalty_deck,
                    rng,
                );
            }
        }

        Choice::SendIt => {
            // Free action. Spend obstacle's send_it_cost in momentum.
            if state.active_obstacles.is_empty() {
                return;
            }
            let obstacle = state.active_obstacles[0];
            let send_cost = obstacle.send_it_cost() as i32;

            if state.players[player_index].momentum < send_cost {
                // Can't send it - terrain penalty then crash
                apply_obstacle_terrain_penalty(state, player_index, &obstacle, rng);
                crash(
                    &mut state.players[player_index],
                    &mut state.penalty_deck,
                    rng,
                );
                let removed_obstacle = state.active_obstacles.remove(0);
                let player_id = state.players[player_index].id.clone();
                state.obstacle_discard.push_back(removed_obstacle);
                reveal_obstacle(state, &player_id, removed_obstacle);
                return;
            }

            // Step 1: Terrain effect ALWAYS fires
            apply_obstacle_terrain_penalty(state, player_index, &obstacle, rng);

            // Step 2: Pay momentum cost + hazard die, earn shred
            let player = &mut state.players[player_index];
            player.momentum -= send_cost;

            // +1 hazard die (or +2 for "The 10ft Drop" which is handled by Bottom Out penalty_type)
            player.hazard_dice += 1;

            // Pro Line blow-by: extra +1 hazard die
            if player.commitment == Commitment::Pro {
                player.hazard_dice += 1;
            }
            let shred_gain = if player.commitment == Commitment::Pro {
                2
            } else {
                1
            };
            player.shred += shred_gain;
            player.obstacles_cleared += 1;
            // Factory Suspension: Pro Line obstacle clears gain +2 Flow
            if player.commitment == Commitment::Pro
                && player.upgrades.contains(&UpgradeType::FactorySuspension)
            {
                player.flow += 2;
                player.flow_from_other += 2;
                track_upgrade_activation(player, UpgradeType::FactorySuspension);
            }

            // Remove obstacle
            let removed_obstacle = state.active_obstacles.remove(0);
            let player_id = state.players[player_index].id.clone();
            state.obstacle_discard.push_back(removed_obstacle);
            reveal_obstacle(state, &player_id, removed_obstacle);

            // Crash check from accumulated hazard dice
            if state.players[player_index].hazard_dice >= 6 {
                crash(
                    &mut state.players[player_index],
                    &mut state.penalty_deck,
                    rng,
                );
            }
        }

        Choice::FlowSpend { action } => {
            let player = &mut state.players[player_index];
            match action {
                FlowAction::Reroll => {
                    // Reroll is now automatic during reckoning — spending flow
                    // during sprint to "reroll" is a no-op. The AI shouldn't
                    // pick this; it's kept for compatibility.
                }
                FlowAction::Brace => {
                    if player.flow >= 1 {
                        player.flow -= 1;
                        player.flow_spent_abilities += 1;
                    }
                }
                FlowAction::Scrub => {
                    if player.flow >= 3 {
                        player.flow -= 3;
                        player.flow_spent_abilities += 3;
                        player.hazard_dice = (player.hazard_dice - 1).max(0);
                    }
                }
                FlowAction::GhostCopy => {
                    if player.flow >= 1 {
                        player.flow -= 1;
                        player.flow_spent_abilities += 1;
                    }
                }
            }
        }

        Choice::CommitLine { line } => {
            let player = &mut state.players[player_index];
            player.commitment = *line;
        }

        Choice::EndTurn => {
            let player = &mut state.players[player_index];
            player.turn_ended = true;

            // Apply deferred momentum from obstacle matches
            if player.pending_momentum > 0 {
                let max_momentum = if player.penalties.contains(&PenaltyType::DroppedChain) {
                    2
                } else {
                    12
                };
                player.momentum =
                    (player.momentum + player.pending_momentum).min(max_momentum);
                player.pending_momentum = 0;
            }

            // Reset actions
            player.actions_remaining = 0;

            // Move to next player in standings order (highest shred first)
            let mut turn_order: Vec<(usize, i32)> = state
                .players
                .iter()
                .enumerate()
                .map(|(i, p)| (i, p.shred))
                .collect();
            turn_order.sort_by(|a, b| b.1.cmp(&a.1));
            let current_order_idx = turn_order.iter().position(|x| x.0 == player_index);
            if let Some(idx) = current_order_idx {
                if idx + 1 < turn_order.len() {
                    state.current_player_index = turn_order[idx + 1].0;
                }
            }
        }

        Choice::BuyUpgrade { upgrade } => {
            let upgrade = *upgrade;
            let player = &mut state.players[player_index];
            if player.upgrades.contains(&upgrade) {
                return; // Already owns it
            }
            if player.flow < upgrade.flow_cost() {
                return; // Not enough flow
            }
            let cost = upgrade.flow_cost();
            player.flow -= cost;
            player.flow_spent_upgrades += cost;
            player.upgrades.push(upgrade);
        }

        // Abstract choices should be refined before reaching process_action.
        // If they arrive here, treat as no-op.
        Choice::SteerBest | Choice::TechniqueBest => {}
    }
}

// ── Phase transitions ──

pub fn advance_phase(state: &mut GameState, rng: &mut impl Rng) {
    match state.phase {
        GamePhase::Setup => {
            state.phase = GamePhase::ScrollDescent;
            execute_scroll_descent(state);
        }
        GamePhase::ScrollDescent => {
            state.phase = GamePhase::Commitment;
            // Commitment: players make choices - nothing automated
        }
        GamePhase::Commitment => {
            state.phase = GamePhase::Environment;
            execute_environment(state, rng);
        }
        GamePhase::Environment => {
            state.phase = GamePhase::Preparation;
            execute_preparation(state, rng);
        }
        GamePhase::Preparation => {
            state.phase = GamePhase::Sprint;
            execute_sprint_setup(state, rng);
        }
        GamePhase::Sprint => {
            state.phase = GamePhase::Alignment;
            execute_alignment(state);
        }
        GamePhase::Alignment => {
            state.phase = GamePhase::Reckoning;
            execute_reckoning(state, rng);
        }
        GamePhase::Reckoning => {
            // Check for game over first (so last round skips the shop)
            if state.round >= state.trail_length {
                state.phase = GamePhase::GameOver;
            } else if state.round > 0 && state.round % 3 == 0 {
                state.phase = GamePhase::StageBreak;
                execute_stage_break(state, rng);
            } else {
                state.phase = GamePhase::ScrollDescent;
                execute_scroll_descent(state);
            }
        }
        GamePhase::StageBreak => {
            if state.round >= state.trail_length {
                state.phase = GamePhase::GameOver;
            } else {
                state.phase = GamePhase::ScrollDescent;
                execute_scroll_descent(state);
            }
        }
        GamePhase::GameOver => {
            // Nothing to do
        }
    }
}

// ── Phase execution functions ──

fn execute_scroll_descent(state: &mut GameState) {
    state.round += 1;

    // Discard active, move queued to active, flip new queue
    state.active_trail_card = state.queued_trail_card.take();
    state.queued_trail_card = state.trail_deck.pop_front();

    // Shift all tokens down 1 row
    for player in &mut state.players {
        // Get row 4 (bottom visible) token position before shifting
        let row4_col = get_token_col(&player.grid, 4).unwrap_or(2);

        // Shift down: row[5] = row[4], row[4] = row[3], etc.
        for r in (1..=5).rev() {
            for c in 0..5 {
                player.grid[r][c] = player.grid[r - 1][c];
            }
        }

        // New token enters Row 0 at previous row 4's position (or center if none)
        for c in 0..5 {
            player.grid[0][c] = false;
        }
        player.grid[0][row4_col] = true;
    }

    // Clear active obstacles and revealed obstacles from previous round
    state.active_obstacles.clear();
    state.round_revealed_obstacles.clear();
    state.player_obstacle_lines.clear();
}

fn execute_environment(state: &mut GameState, rng: &mut impl Rng) {
    state.current_hazards.clear();

    if state.trail_hazards.is_empty() {
        state.trail_hazards = VecDeque::from(create_trail_hazards(rng));
    }

    if let Some(hazard) = state.trail_hazards.pop_front() {
        state.current_hazards.push(hazard);

        // Determine which rows this hazard card affects based on its type
        let hazard_rows: Vec<usize> = match hazard.hazard_type {
            TrailHazardType::CamberLeft | TrailHazardType::CamberRight => vec![0, 1, 2],
            TrailHazardType::BrakeBumps => vec![0, 1],
            TrailHazardType::Compression => vec![2, 3],
            TrailHazardType::LooseDirt => vec![4, 5],
        };

        for player in &mut state.players {
            for &row in &hazard_rows {
                if let Some(col) = get_token_col(&player.grid, row) {
                    let dir: i32 = match hazard.hazard_type {
                        TrailHazardType::BrakeBumps => {
                            // Toward nearest edge
                            if col >= 2 { 1 } else { -1 }
                        }
                        TrailHazardType::Compression => {
                            // Toward center
                            if col > 2 {
                                -1
                            } else if col < 2 {
                                1
                            } else {
                                0
                            }
                        }
                        TrailHazardType::LooseDirt => {
                            // Random direction
                            if rng.random_bool(0.5) { -1 } else { 1 }
                        }
                        _ => hazard.push_direction,
                    };

                    if dir != 0 {
                        set_token_signed(&mut player.grid, row, col as i32 + dir);
                    }
                }
            }
        }
    }
}

fn execute_preparation(state: &mut GameState, rng: &mut impl Rng) {
    let player_count = state.players.len();
    for i in 0..player_count {
        // Speed trap: if momentum > trail speed limit, excess becomes hazard dice
        if let Some(card) = state.active_trail_card {
            let speed_limit = card.speed_limit() as i32;
            if state.players[i].momentum > speed_limit {
                let excess = state.players[i].momentum - speed_limit;
                state.players[i].hazard_dice += excess;
                state.players[i].momentum = speed_limit;
            }
        }

        // Draw cards based on momentum (min 2 or 4 with Carbon Frame, max 6)
        let min_draw = if state.players[i].upgrades.contains(&UpgradeType::CarbonFrame) {
            track_upgrade_activation(&mut state.players[i], UpgradeType::CarbonFrame);
            4
        } else {
            2
        };
        let draw_count = (state.players[i].momentum.max(min_draw).min(6)) as usize;
        let drawn = draw_cards_with_rng(state, draw_count, rng);
        state.players[i].hand.extend(drawn);
    }
}

fn execute_sprint_setup(state: &mut GameState, rng: &mut impl Rng) {
    for player in &mut state.players {
        player.actions_remaining = 5;
        player.crashed = false;
        player.turn_ended = false;
        player.cannot_pedal = false;
        player.cannot_brake = false;
        player.drew_fresh_obstacle = false;
        player.trail_read_committed_player = None;
        player.trail_read_next_index = 0;
        player.pending_momentum = 0;

        // Apply "Arm Pump" penalty (max actions = 3)
        if player.penalties.contains(&PenaltyType::ArmPump) {
            player.actions_remaining = 3;
        }

        // Apply penalty-based flags
        if player.penalties.contains(&PenaltyType::BentDerailleur) {
            player.cannot_pedal = true;
        }
        if player.penalties.contains(&PenaltyType::SnappedBrake) {
            player.cannot_brake = true;
        }

    }

    // Telemetry System: peek at top 3 obstacles, pick best matchable one
    for i in 0..state.players.len() {
        if !state.players[i].upgrades.contains(&UpgradeType::TelemetrySystem) {
            continue;
        }
        // Peek at top 3
        let peek_count = 3.min(state.obstacle_deck.len());
        if peek_count == 0 {
            continue;
        }
        let peeked: Vec<ObstacleType> = state.obstacle_deck.iter().take(peek_count).copied().collect();

        // Pick the one we can match (prefer matchable, then easiest send-it cost)
        let mut best_idx = 0;
        let mut best_score = -1i32;
        for (j, obs) in peeked.iter().enumerate() {
            let can_match = crate::choices::can_match_obstacle(&state.players[i].hand, obs);
            let score = if can_match { 100 } else { -(obs.send_it_cost() as i32) };
            if score > best_score {
                best_score = score;
                best_idx = j;
            }
        }

        // Remove chosen obstacle from deck, put others back
        let chosen = state.obstacle_deck.remove(best_idx).unwrap();
        state.active_obstacles.push(chosen);
        track_upgrade_activation(&mut state.players[i], UpgradeType::TelemetrySystem);
    }

    // Turn order: leader goes first (highest shred, random tiebreak)
    let mut order: Vec<(usize, i32)> = state
        .players
        .iter()
        .enumerate()
        .map(|(i, p)| (i, p.shred))
        .collect();
    // Shuffle for random tiebreak
    order.shuffle(rng);
    // Stable sort by shred descending
    order.sort_by(|a, b| b.1.cmp(&a.1));

    state.current_player_index = order[0].0;
}

fn execute_alignment(state: &mut GameState) {
    let card = match state.active_trail_card {
        Some(c) => c,
        None => return,
    };

    for player in &mut state.players {
        let mut all_perfect = true;

        let checked_rows = card.checked_rows();
        let target_lanes = card.target_lanes();
        for i in 0..checked_rows.len() {
            let row = checked_rows[i];
            let target_lane = target_lanes[i];

            if let Some(player_lane) = get_token_col(&player.grid, row) {
                player.alignment_checks += 1;
                let distance = (player_lane as i32 - target_lane as i32).unsigned_abs() as usize;
                if distance >= 2 {
                    player.hazard_dice += 1;
                    player.hazard_from_misalignment += 1;
                    all_perfect = false;
                } else if distance == 0 {
                    player.alignment_hits += 1;
                } else {
                    all_perfect = false;
                }
            }
        }

        if all_perfect && !checked_rows.is_empty() {
            let flow_earned = checked_rows.len() as i32;
            player.flow += flow_earned;
            player.flow_from_alignment += flow_earned;
            player.perfect_matches += 1;
        }
    }
}

fn execute_reckoning(state: &mut GameState, rng: &mut impl Rng) {
    state.last_hazard_rolls.clear();

    let player_count = state.players.len();
    for i in 0..player_count {
        let player = &mut state.players[i];

        if player.hazard_dice <= 0 {
            state.last_hazard_rolls.push(serde_json::json!({
                "playerName": player.name,
                "rolls": [],
                "penaltyDrawn": null
            }));
            continue;
        }

        // Crash check: if accumulated dice >= 6, crash during reckoning
        if player.hazard_dice >= 6 {
            player.crashed = true;
            // Reset all tokens to center
            for r in 0..6 {
                for c in 0..5 {
                    player.grid[r][c] = false;
                }
                player.grid[r][2] = true;
            }
            // Draw an extra penalty card for crashing
            if let Some(pen) = state.penalty_deck.pop_front() {
                player.penalties.push(pen);
            }
            player.momentum = (player.momentum - 3).max(0);

            state.last_hazard_rolls.push(serde_json::json!({
                "playerName": player.name,
                "rolls": [],
                "penaltyDrawn": "crash"
            }));
            player.hazard_dice = 0;
            continue;
        }

        let dice_count = player.hazard_dice.min(5) as usize;
        let mut rolls = Vec::new();

        for _ in 0..dice_count {
            let mut roll: i32 = rng.random_range(1..=6);
            // Flow Reroll: if die shows 6 and player has flow, spend 1 flow to reroll
            if roll == 6 && state.players[i].flow >= 1 {
                state.players[i].flow -= 1;
                state.players[i].flow_spent_abilities += 1;
                roll = rng.random_range(1..=6);
            }
            rolls.push(roll);
        }

        let penalty = rolls.iter().any(|&r| r == 6);

        let mut penalty_drawn: Option<&str> = None;
        if penalty {
            if let Some(pen) = state.penalty_deck.pop_front() {
                penalty_drawn = Some(pen.name());
                state.players[i].penalties.push(pen);
            }
        }

        state.last_hazard_rolls.push(serde_json::json!({
            "playerName": state.players[i].name,
            "rolls": rolls,
            "penaltyDrawn": penalty_drawn
        }));

        state.players[i].hazard_dice = 0;
    }
}

fn execute_stage_break(state: &mut GameState, rng: &mut impl Rng) {
    // Sort by shred to find last place
    let mut sorted: Vec<(usize, i32)> = state
        .players
        .iter()
        .enumerate()
        .map(|(i, p)| (i, p.shred))
        .collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));

    let last_idx = sorted.last().map(|x| x.0).unwrap_or(0);

    // Last place draws 2 extra cards
    let drawn = draw_cards_with_rng(state, 2, rng);
    state.players[last_idx].hand.extend(drawn);

    // Repair: everyone discards 1 penalty
    for player in &mut state.players {
        if !player.penalties.is_empty() {
            player.penalties.remove(0);
        }
    }
}
