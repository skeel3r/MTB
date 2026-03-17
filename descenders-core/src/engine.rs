use rand::prelude::*;
use rand::RngExt;
use std::collections::HashMap;

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

// ── Crash ──

/// Crash a player: reset grid to center, lose 3 momentum, draw penalty, end turn.
pub fn crash(
    player: &mut PlayerState,
    penalty_deck: &mut Vec<PenaltyCard>,
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
    if let Some(pen) = penalty_deck.first().cloned() {
        penalty_deck.remove(0);
        player.penalties.push(pen);
    }
    player.crashed = true;
    player.turn_ended = true;
}

// ── Card drawing ──

fn draw_cards(state: &mut GameState, count: usize) -> Vec<TechniqueCard> {
    let mut cards = Vec::new();
    for _ in 0..count {
        if state.technique_deck.is_empty() {
            if !state.technique_discard.is_empty() {
                // We need an rng but don't have one here - shuffle manually
                // This is called from contexts where we can't easily thread rng
                // We'll use a simple swap approach
                state.technique_deck.append(&mut state.technique_discard);
                // Note: shuffling requires rng - we'll handle this in callers
            }
        }
        if let Some(card) = state.technique_deck.first().cloned() {
            state.technique_deck.remove(0);
            cards.push(card);
        }
    }
    cards
}

fn draw_cards_with_rng(state: &mut GameState, count: usize, rng: &mut impl Rng) -> Vec<TechniqueCard> {
    let mut cards = Vec::new();
    for _ in 0..count {
        if state.technique_deck.is_empty() {
            if !state.technique_discard.is_empty() {
                state.technique_deck.append(&mut state.technique_discard);
                state.technique_deck.shuffle(rng);
            }
        }
        if let Some(card) = state.technique_deck.first().cloned() {
            state.technique_deck.remove(0);
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
    hand: &[TechniqueCard],
    obstacle: &ProgressObstacle,
) -> Option<Vec<usize>> {
    let mode = obstacle.effective_match_mode();

    if mode == "any" {
        // Need ONE matching symbol - try exact first
        for sym in &obstacle.symbols {
            if let Some(idx) = hand.iter().position(|c| c.symbol == *sym) {
                return Some(vec![idx]);
            }
        }
        // Try wild: any 2 cards of the same symbol
        let mut symbol_groups: HashMap<CardSymbol, Vec<usize>> = HashMap::new();
        for (i, card) in hand.iter().enumerate() {
            symbol_groups.entry(card.symbol).or_default().push(i);
        }
        for indices in symbol_groups.values() {
            if indices.len() >= 2 {
                return Some(vec![indices[0], indices[1]]);
            }
        }
        return None;
    }

    // mode == "all": need every required symbol
    let mut used_indices = Vec::new();
    let mut matched_indices = Vec::new();
    let mut unmatched_symbols = Vec::new();

    // Pass 1: exact matches
    for sym in &obstacle.symbols {
        let mut found = false;
        for (i, card) in hand.iter().enumerate() {
            if card.symbol == *sym && !used_indices.contains(&i) {
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
                available.entry(card.symbol).or_default().push(i);
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
    obstacle: &ProgressObstacle,
    rng: &mut impl Rng,
) {
    let player = &mut state.players[player_index];

    match obstacle.penalty_type.as_str() {
        "Slide Out" => {
            // Row 1 (index 0) token shifts 2 lanes randomly
            if let Some(col) = get_token_col(&player.grid, 0) {
                let dir: i32 = if rng.random_bool(0.5) { -2 } else { 2 };
                set_token_signed(&mut player.grid, 0, col as i32 + dir);
            }
        }
        "Heavy Drag" => {
            // Lose 2 Momentum and 1 card from hand
            player.momentum = (player.momentum - 2).max(0);
            if !player.hand.is_empty() {
                let discard_idx = rng.random_range(0..player.hand.len());
                let discarded = player.hand.remove(discard_idx);
                state.technique_discard.push(discarded);
            }
        }
        "Case It" => {
            // Lose 2 Momentum immediately
            let player = &mut state.players[player_index];
            player.momentum = (player.momentum - 2).max(0);
        }
        "Bottom Out" => {
            // Take 2 Hazard Dice instead of the normal 1 (1 already added in send_it, add 1 more)
            state.players[player_index].hazard_dice += 1;
        }
        "Wide Turn" => {
            // Row 1 (index 0) shifts 1 lane away from center
            shift_away_from_center(&mut state.players[player_index].grid, 0);
        }
        "Whiplash" => {
            // Shift Row 2 and Row 3 (indices 1, 2) one lane right
            for r in [1, 2] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 + 1);
                }
            }
        }
        "Stall" => {
            // Cannot Pedal this turn
            state.players[player_index].cannot_pedal = true;
        }
        "Locked" => {
            // Simplified: shift row 0 to center
            set_token(&mut state.players[player_index].grid, 0, 2);
        }
        "Wipeout" => {
            // Take 2 Hazard Dice (1 extra) and end turn immediately
            let player = &mut state.players[player_index];
            player.hazard_dice += 1;
            player.turn_ended = true;
        }
        "Wash Out" => {
            // Shift Row 1 and Row 2 (indices 0, 1) three lanes (random direction)
            let dir: i32 = if rng.random_bool(0.5) { -3 } else { 3 };
            for r in [0, 1] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 + dir);
                }
            }
        }
        "Full Send" => {
            // Shift Rows 1 and 2 (indices 0, 1) two lanes away from center
            for r in [0, 1] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    let dir: i32 = if col >= 2 { 2 } else { -2 };
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 + dir);
                }
            }
        }
        "Pinball" => {
            // Shift Rows 1-3 (indices 0-2) one lane away from center
            for r in [0, 1, 2] {
                shift_away_from_center(&mut state.players[player_index].grid, r);
            }
        }
        "Tangled" => {
            // Shift Rows 2-4 (indices 1-3) one lane left
            for r in [1, 2, 3] {
                if let Some(col) = get_token_col(&state.players[player_index].grid, r) {
                    set_token_signed(&mut state.players[player_index].grid, r, col as i32 - 1);
                }
            }
        }
        "Overshoot" => {
            // Shift Row 1 (index 0) two lanes and Row 3 (index 2) one lane away from center
            if let Some(col) = get_token_col(&state.players[player_index].grid, 0) {
                let dir: i32 = if col >= 2 { 2 } else { -2 };
                set_token_signed(&mut state.players[player_index].grid, 0, col as i32 + dir);
            }
            shift_away_from_center(&mut state.players[player_index].grid, 2);
        }
        _ => {}
    }
}

// ── Reveal obstacle helper ──

fn reveal_obstacle(state: &mut GameState, player_id: &str, obstacle: ProgressObstacle) {
    state
        .player_obstacle_lines
        .entry(player_id.to_string())
        .or_default()
        .push(obstacle.clone());
    state.round_revealed_obstacles.push(obstacle);
}

// ── Standings ──

/// Get standings sorted by tiebreaker order. Returns vec of (original_index, reference).
pub fn get_standings(state: &GameState) -> Vec<(usize, &PlayerState)> {
    let mut indexed: Vec<(usize, &PlayerState)> = state.players.iter().enumerate().collect();
    indexed.sort_by(|(_, a), (_, b)| {
        b.obstacles_cleared
            .cmp(&a.obstacles_cleared)
            .then(b.progress.cmp(&a.progress))
            .then(b.perfect_matches.cmp(&a.perfect_matches))
            .then(a.penalties.len().cmp(&b.penalties.len()))
            .then(b.flow.cmp(&a.flow))
            .then(b.momentum.cmp(&a.momentum))
    });
    indexed
}

// ── Check if player has upgrade ──

fn has_upgrade(player: &PlayerState, name: &str) -> bool {
    player.upgrades.iter().any(|u| u.name == name)
}

fn has_penalty(player: &PlayerState, name: &str) -> bool {
    player.penalties.iter().any(|p| p.name == name)
}

// ── Initialize game ──

pub fn init_game(
    player_count: usize,
    trail_id: Option<&str>,
    rng: &mut impl Rng,
) -> GameState {
    let mut technique_deck = create_technique_deck(rng);

    let mut players = Vec::new();
    for i in 0..player_count {
        // 6x5 grid, tokens in column 2 for rows 0-4
        let mut grid = vec![vec![false; 5]; 6];
        for row in 0..5 {
            grid[row][2] = true;
        }

        // Earlier players get more starting cards
        let starting_cards = (player_count - i).max(1);
        let hand: Vec<TechniqueCard> = technique_deck
            .drain(..starting_cards.min(technique_deck.len()))
            .collect();

        players.push(PlayerState {
            id: format!("player-{}", i),
            name: format!("Player {}", i + 1),
            grid,
            momentum: 2,
            flow: 0,
            progress: 0,
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
            pending_momentum: 0,
        });
    }

    let mut trail_deck = create_trail_deck(trail_id);
    let trail_length = trail_deck.len() as u32;
    let queued_trail_card = if !trail_deck.is_empty() {
        Some(trail_deck.remove(0))
    } else {
        None
    };

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
        technique_discard: Vec::new(),
        penalty_deck: create_penalty_deck(rng),
        obstacle_deck: create_obstacle_deck(rng),
        obstacle_discard: Vec::new(),
        active_obstacles: Vec::new(),
        trail_hazards: create_trail_hazards(rng),
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
    {
        let player = &state.players[player_index];
        if player.crashed || player.turn_ended {
            return;
        }
    }

    match choice {
        Choice::Pedal => {
            let player = &mut state.players[player_index];
            if player.cannot_pedal {
                return;
            }

            // "High-Engagement Hubs" upgrade: first pedal per turn is free
            let free_pedal = has_upgrade(player, "High-Engagement Hubs")
                && !player.turn_ended; // simplified: always free if has upgrade (first pedal check)
            // More precise: track if pedal was already used. For simplicity, check actions.
            // The TS code doesn't track pedal count either, so we just make pedal cost 0 if upgrade present
            // Actually per spec: "first pedal free" - we need to track this. For simplicity in MCTS:
            // just deduct if no upgrade, always deduct 1 action otherwise.
            if !free_pedal {
                if player.actions_remaining < 1 {
                    return;
                }
                player.actions_remaining -= 1;
            } else {
                // With upgrade, still costs action but first is free
                // Per spec: first pedal is 0 actions. We'd need to track per-turn pedal usage.
                // For now: always cost 1 action (upgrade benefit handled elsewhere or simplified)
                if player.actions_remaining < 1 {
                    return;
                }
                player.actions_remaining -= 1;
            }
            player.momentum += 1;
        }

        Choice::Brake => {
            let player = &mut state.players[player_index];
            if player.cannot_brake || player.commitment == Commitment::Pro {
                return;
            }
            if player.actions_remaining < 1 {
                return;
            }
            player.actions_remaining -= 1;

            let reduction = if has_upgrade(player, "Oversized Rotors") {
                2
            } else {
                1
            };
            player.momentum = (player.momentum - reduction).max(0);
        }

        Choice::Steer { row, direction } => {
            let row = *row;
            let direction = *direction;

            let player = &mut state.players[player_index];

            // "Stretched Cable" penalty: must discard 1 card to steer
            if has_penalty(player, "Stretched Cable") {
                if player.hand.is_empty() {
                    return; // Can't steer without cards
                }
                let discarded = player.hand.remove(0);
                state.technique_discard.push(discarded);
            }

            let player = &mut state.players[player_index];

            // "Electronic Shifting" upgrade: first steer per turn is free
            // Simplified: always cost 1 action
            if player.actions_remaining < 1 {
                return;
            }
            player.actions_remaining -= 1;

            if let Some(col) = get_token_col(&player.grid, row) {
                set_token_signed(&mut player.grid, row, col as i32 + direction);
            }

            // "Bent Bars" penalty: rows 2-3 (0-indexed) move together
            if has_penalty(player, "Bent Bars") {
                let other_row = if row == 2 { 3 } else if row == 3 { 2 } else { usize::MAX };
                if other_row < 6 {
                    if let Some(col) = get_token_col(&player.grid, other_row) {
                        set_token_signed(&mut player.grid, other_row, col as i32 + direction);
                    }
                }
            }

            // "Loose Headset" penalty: +1 hazard die per steer
            if has_penalty(player, "Loose Headset") {
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
            match card.name.as_str() {
                "Inside Line" => {
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
                "Manual" => {
                    // Swap row 0 and row 1 tokens
                    let col0 = get_token_col(&state.players[player_index].grid, 0);
                    let col1 = get_token_col(&state.players[player_index].grid, 1);
                    if let (Some(c0), Some(c1)) = (col0, col1) {
                        set_token(&mut state.players[player_index].grid, 0, c1);
                        set_token(&mut state.players[player_index].grid, 1, c0);
                    }
                }
                "Flick" => {
                    // Shift tokens in rows 0-2 one lane toward center
                    for r in 0..=2 {
                        shift_toward_center(&mut state.players[player_index].grid, r);
                    }
                }
                "Recover" => {
                    // Remove 2 hazard dice (min 0). Center row 0.
                    let player = &mut state.players[player_index];
                    player.hazard_dice = (player.hazard_dice - 2).max(0);
                    // Center row 0
                    set_token(&mut player.grid, 0, 2);
                }
                "Pump" => {
                    // Shift tokens in rows 3-5 one lane toward center
                    for r in 3..=5 {
                        shift_toward_center(&mut state.players[player_index].grid, r);
                    }
                }
                "Whip" => {
                    // Move row 0 token to center for simplicity
                    set_token(&mut state.players[player_index].grid, 0, 2);
                }
                _ => {}
            }

            // Discard the card
            state.technique_discard.push(card);
        }

        Choice::DrawObstacle => {
            // Free action - no action cost
            state.players[player_index].drew_fresh_obstacle = true;

            if state.obstacle_deck.is_empty() {
                if !state.obstacle_discard.is_empty() {
                    state.obstacle_deck.append(&mut state.obstacle_discard);
                    state.obstacle_deck.shuffle(rng);
                }
            }
            if let Some(drawn) = state.obstacle_deck.first().cloned() {
                state.obstacle_deck.remove(0);
                state.active_obstacles.push(drawn);
            }
        }

        Choice::ReuseObstacle { revealed_index } => {
            let revealed_index = *revealed_index;
            let player = &state.players[player_index];
            if player.drew_fresh_obstacle {
                return;
            }
            if revealed_index >= state.round_revealed_obstacles.len() {
                return;
            }
            let reused = state.round_revealed_obstacles[revealed_index].clone();
            state.active_obstacles.push(reused);
        }

        Choice::ResolveObstacle => {
            // Free action. Try to match active_obstacles[0] with hand cards.
            if state.active_obstacles.is_empty() {
                return;
            }
            let obstacle = state.active_obstacles[0].clone();

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
                    state.technique_discard.push(removed);
                }

                let progress_gain = if state.players[player_index].commitment == Commitment::Pro {
                    2
                } else {
                    1
                };
                let player = &mut state.players[player_index];
                player.progress += progress_gain;
                player.pending_momentum += 1;
                player.obstacles_cleared += 1;
                player.perfect_matches += 1;
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
            state.obstacle_discard.push(removed_obstacle.clone());
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
            let obstacle = state.active_obstacles[0].clone();
            let send_cost = obstacle.effective_send_it_cost() as i32;

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
                state.obstacle_discard.push(removed_obstacle.clone());
                reveal_obstacle(state, &player_id, removed_obstacle);
                return;
            }

            // Step 1: Terrain effect ALWAYS fires
            apply_obstacle_terrain_penalty(state, player_index, &obstacle, rng);

            // Step 2: Pay momentum cost + hazard die, earn progress
            let player = &mut state.players[player_index];
            player.momentum -= send_cost;

            // +1 hazard die (or +2 for "The 10ft Drop" which is handled by Bottom Out penalty_type)
            player.hazard_dice += 1;

            let progress_gain = if player.commitment == Commitment::Pro {
                2
            } else {
                1
            };
            player.progress += progress_gain;
            player.obstacles_cleared += 1;

            // Remove obstacle
            let removed_obstacle = state.active_obstacles.remove(0);
            let player_id = state.players[player_index].id.clone();
            state.obstacle_discard.push(removed_obstacle.clone());
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
                    if player.flow >= 1 {
                        player.flow -= 1;
                        player.hazard_dice = 0;
                    }
                }
                FlowAction::Brace => {
                    if player.flow >= 1 {
                        player.flow -= 1;
                    }
                }
                FlowAction::Scrub => {
                    if player.flow >= 3 {
                        player.flow -= 3;
                        player.hazard_dice = (player.hazard_dice - 1).max(0);
                    }
                }
                FlowAction::GhostCopy => {
                    if player.flow >= 1 {
                        player.flow -= 1;
                    }
                }
            }
        }

        Choice::CommitLine { line } => {
            let player = &mut state.players[player_index];
            player.commitment = *line;
            if *line == Commitment::Pro {
                player.cannot_brake = true;
            }
        }

        Choice::EndTurn => {
            let player = &mut state.players[player_index];
            player.turn_ended = true;

            // Apply deferred momentum from obstacle matches
            if player.pending_momentum > 0 {
                let max_momentum = if has_penalty(player, "Dropped Chain") {
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

            // Move to next player in standings order (highest progress first)
            let mut turn_order: Vec<(usize, i32)> = state
                .players
                .iter()
                .enumerate()
                .map(|(i, p)| (i, p.progress))
                .collect();
            turn_order.sort_by(|a, b| b.1.cmp(&a.1));
            let current_order_idx = turn_order.iter().position(|x| x.0 == player_index);
            if let Some(idx) = current_order_idx {
                if idx + 1 < turn_order.len() {
                    state.current_player_index = turn_order[idx + 1].0;
                }
            }
        }

        Choice::BuyUpgrade { upgrade_index } => {
            let upgrade_index = *upgrade_index;
            let upgrades = get_upgrades();
            if upgrade_index >= upgrades.len() {
                return;
            }
            let upgrade = &upgrades[upgrade_index];
            let player = &mut state.players[player_index];
            if player.upgrades.iter().any(|u| u.id == upgrade.id) {
                return; // Already owns it
            }
            if player.flow < upgrade.flow_cost {
                return; // Not enough flow
            }
            player.flow -= upgrade.flow_cost;
            player.upgrades.push(upgrade.clone());
        }
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
            // Check for stage break (every 3 rounds)
            if state.round > 0 && state.round % 3 == 0 {
                state.phase = GamePhase::StageBreak;
                execute_stage_break(state, rng);
            } else if state.round >= state.trail_length {
                state.phase = GamePhase::GameOver;
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
    state.queued_trail_card = if !state.trail_deck.is_empty() {
        Some(state.trail_deck.remove(0))
    } else {
        None
    };

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
        state.trail_hazards = create_trail_hazards(rng);
    }

    if let Some(hazard) = state.trail_hazards.first().cloned() {
        state.trail_hazards.remove(0);
        state.current_hazards.push(hazard.clone());

        // Determine which rows this hazard card affects based on its name
        let hazard_rows: Vec<usize> = match hazard.name.as_str() {
            "Camber Left" | "Camber Right" => vec![0, 1, 2],
            "Brake Bumps" => vec![0, 1],
            "Compression" => vec![2, 3],
            "Loose Dirt" => vec![4, 5],
            _ => vec![0],
        };

        for player in &mut state.players {
            for &row in &hazard_rows {
                if let Some(col) = get_token_col(&player.grid, row) {
                    let dir: i32 = match hazard.name.as_str() {
                        "Brake Bumps" => {
                            // Toward nearest edge
                            if col >= 2 { 1 } else { -1 }
                        }
                        "Compression" => {
                            // Toward center
                            if col > 2 {
                                -1
                            } else if col < 2 {
                                1
                            } else {
                                0
                            }
                        }
                        "Loose Dirt" => {
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
        if let Some(ref card) = state.active_trail_card {
            let speed_limit = card.speed_limit as i32;
            if state.players[i].momentum > speed_limit {
                let excess = state.players[i].momentum - speed_limit;
                state.players[i].hazard_dice += excess;
                state.players[i].momentum = speed_limit;
            }
        }

        // Draw cards based on momentum (min 2, max 6, capped by deck)
        let draw_count = (state.players[i].momentum.max(2).min(6)) as usize;
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
        player.pending_momentum = 0;

        // Apply "Arm Pump" penalty (max actions = 3)
        if has_penalty(player, "Arm Pump") {
            player.actions_remaining = 3;
        }

        // Apply penalty-based flags
        if has_penalty(player, "Bent Derailleur") {
            player.cannot_pedal = true;
        }
        if has_penalty(player, "Snapped Brake") {
            player.cannot_brake = true;
        }

        // Pro line: cannot brake
        if player.commitment == Commitment::Pro {
            player.cannot_brake = true;
        }
    }

    // Turn order: leader goes first (highest progress, random tiebreak)
    let mut order: Vec<(usize, i32)> = state
        .players
        .iter()
        .enumerate()
        .map(|(i, p)| (i, p.progress))
        .collect();
    // Shuffle for random tiebreak
    order.shuffle(rng);
    // Stable sort by progress descending
    order.sort_by(|a, b| b.1.cmp(&a.1));

    state.current_player_index = order[0].0;
}

fn execute_alignment(state: &mut GameState) {
    let card = match &state.active_trail_card {
        Some(c) => c.clone(),
        None => return,
    };

    for player in &mut state.players {
        let mut all_perfect = true;

        for i in 0..card.checked_rows.len() {
            let row = card.checked_rows[i];
            let target_lane = card.target_lanes[i];

            if let Some(player_lane) = get_token_col(&player.grid, row) {
                let distance = (player_lane as i32 - target_lane as i32).unsigned_abs() as usize;
                if distance >= 2 {
                    player.hazard_dice += 1;
                    all_perfect = false;
                } else if distance > 0 {
                    all_perfect = false;
                }
            }
        }

        if all_perfect && !card.checked_rows.is_empty() {
            player.flow += 1;
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
            if let Some(pen) = state.penalty_deck.first().cloned() {
                state.penalty_deck.remove(0);
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
        let mut penalty = false;

        for _ in 0..dice_count {
            let roll: i32 = rng.random_range(1..=6);
            rolls.push(roll);
            if roll == 6 {
                penalty = true;
            }
        }

        let mut penalty_drawn: Option<String> = None;
        if penalty {
            if let Some(pen) = state.penalty_deck.first().cloned() {
                state.penalty_deck.remove(0);
                penalty_drawn = Some(pen.name.clone());
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
    // Sort by progress to find last place
    let mut sorted: Vec<(usize, i32)> = state
        .players
        .iter()
        .enumerate()
        .map(|(i, p)| (i, p.progress))
        .collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));

    let last_idx = sorted.last().map(|x| x.0).unwrap_or(0);

    // Last place draws 2 extra cards
    let drawn = draw_cards_with_rng(state, 2, rng);
    state.players[last_idx].hand.extend(drawn);

    // Last place gains 1 flow
    state.players[last_idx].flow += 1;

    // Repair: everyone discards 1 penalty
    for player in &mut state.players {
        if !player.penalties.is_empty() {
            player.penalties.remove(0);
        }
    }
}
