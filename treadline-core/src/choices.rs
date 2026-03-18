use rand::prelude::IndexedRandom;

use crate::types::*;

/// Number of columns in the player grid (lanes 0..4).
const NUM_COLS: usize = 5;
/// Number of rows in the player grid (rows 0..5).
const NUM_ROWS: usize = 6;

/// Find the column where the token sits in `row`, or `None` if no token.
fn get_token_col(grid: &[Vec<bool>], row: usize) -> Option<usize> {
    for c in 0..NUM_COLS {
        if grid[row][c] {
            return Some(c);
        }
    }
    None
}

/// Check whether the player's hand can resolve a given obstacle.
///
/// - "any" mode: need one card matching any of the obstacle's symbols, OR two
///   cards of the same symbol to form a wild.
/// - "all" mode: for each required symbol, first try an exact match from hand;
///   remaining unmatched symbols can be covered by "forced through" wilds (two
///   cards of the same symbol = one wild match).
pub fn can_match_obstacle(hand: &[TechniqueType], obstacle: &ObstacleType) -> bool {
    let mode = obstacle.match_mode();

    if mode == MatchMode::Any {
        // Need ONE card that matches any of the obstacle symbols
        for card in hand {
            if obstacle.symbols().contains(&card.symbol()) {
                return true;
            }
        }
        // Or 2 cards of the same symbol (wild)
        let mut counts = [0u32; 4];
        for card in hand {
            let idx = symbol_index(card.symbol());
            counts[idx] += 1;
            if counts[idx] >= 2 {
                return true;
            }
        }
        false
    } else {
        // "all" mode: must match every symbol in the obstacle
        can_match_all(hand, obstacle.symbols())
    }
}

fn symbol_index(s: CardSymbol) -> usize {
    match s {
        CardSymbol::Grip => 0,
        CardSymbol::Air => 1,
        CardSymbol::Agility => 2,
        CardSymbol::Balance => 3,
    }
}

/// Check if the hand can satisfy ALL required symbols via exact matches and
/// wild (2-for-1 forced-through) substitutions.
fn can_match_all(hand: &[TechniqueType], required: &[CardSymbol]) -> bool {
    // Count available cards by symbol
    let mut available = [0u32; 4];
    for card in hand {
        available[symbol_index(card.symbol())] += 1;
    }

    // First pass: exact matches
    let mut remaining = [0u32; 4];
    for &sym in required {
        let idx = symbol_index(sym);
        if available[idx] > 0 {
            available[idx] -= 1;
        } else {
            remaining[idx] += 1;
        }
    }

    let unmatched: u32 = remaining.iter().sum();
    if unmatched == 0 {
        return true;
    }

    // Second pass: wilds — 2 cards of any same symbol = 1 wild
    let wild_count: u32 = available.iter().map(|&c| c / 2).sum();
    wild_count >= unmatched
}

/// Enumerate all legal choices for the current game state.
pub fn enumerate_choices(state: &GameState) -> Vec<Choice> {
    match state.phase {
        GamePhase::Commitment => enumerate_commitment_choices(),
        GamePhase::Sprint => enumerate_sprint_choices(state),
        GamePhase::StageBreak => enumerate_stage_break_choices(state),
        GamePhase::GameOver => Vec::new(),
        // Non-decision phases are automated
        _ => Vec::new(),
    }
}

fn enumerate_commitment_choices() -> Vec<Choice> {
    vec![
        Choice::CommitLine { line: Commitment::Main },
        Choice::CommitLine { line: Commitment::Pro },
    ]
}

fn enumerate_sprint_choices(state: &GameState) -> Vec<Choice> {
    let player = &state.players[state.current_player_index];

    // If player has crashed or ended turn, no choices
    if player.crashed || player.turn_ended {
        return Vec::new();
    }

    // If there are active obstacles, must deal with the first one
    if !state.active_obstacles.is_empty() {
        return enumerate_obstacle_choices(state, player);
    }

    enumerate_free_sprint_choices(state, player)
}

fn enumerate_obstacle_choices(state: &GameState, player: &PlayerState) -> Vec<Choice> {
    let obstacle = &state.active_obstacles[0];
    let mut choices = Vec::new();

    let can_resolve = can_match_obstacle(&player.hand, obstacle);
    let can_send = player.momentum >= obstacle.send_it_cost() as i32;

    if can_resolve {
        choices.push(Choice::ResolveObstacle);
    }
    if can_send {
        choices.push(Choice::SendIt);
    }

    // If neither is possible, forced send_it (will likely cause a crash)
    if choices.is_empty() {
        choices.push(Choice::SendIt);
    }

    choices
}

fn enumerate_free_sprint_choices(state: &GameState, player: &PlayerState) -> Vec<Choice> {
    let mut choices = Vec::new();
    let actions = player.actions_remaining;

    if actions > 0 {
        // Pedal
        if !player.cannot_pedal {
            choices.push(Choice::Pedal);
        }

        // Brake
        if !player.cannot_brake && player.momentum > 0 {
            choices.push(Choice::Brake);
        }

        // Steer: single abstract choice (refined later via refine_choice)
        let can_steer = (0..NUM_ROWS).any(|row| {
            if let Some(col) = get_token_col(&player.grid, row) {
                col > 0 || col < NUM_COLS - 1
            } else {
                false
            }
        });
        if can_steer {
            choices.push(Choice::SteerBest);
        }

        // Technique cards: single abstract choice (refined later)
        if !player.hand.is_empty() {
            choices.push(Choice::TechniqueBest);
        }
    }

    // DrawObstacle (free action)
    if !state.obstacle_deck.is_empty() || !state.obstacle_discard.is_empty() {
        choices.push(Choice::DrawObstacle);
    }

    // ReuseObstacle: follow a player's obstacle line in order
    // revealed_index is repurposed as target_player_index
    if !player.drew_fresh_obstacle && state.active_obstacles.is_empty() {
        if let Some(committed) = player.trail_read_committed_player {
            // Already committed — can only continue with the same player's line
            let target_id = &state.players[committed].id;
            if let Some(line) = state.player_obstacle_lines.get(target_id) {
                if player.trail_read_next_index < line.len() {
                    choices.push(Choice::ReuseObstacle { revealed_index: committed });
                }
            }
        } else {
            // Not committed — offer each other player's line that has obstacles
            let player_idx = state.current_player_index;
            for (i, p) in state.players.iter().enumerate() {
                if i == player_idx { continue; } // Can't follow own line
                if let Some(line) = state.player_obstacle_lines.get(&p.id) {
                    if !line.is_empty() {
                        choices.push(Choice::ReuseObstacle { revealed_index: i });
                    }
                }
            }
        }
    }

    // Flow spends (Reroll is now automatic during reckoning)
    if player.flow >= 3 && player.hazard_dice > 0 {
        choices.push(Choice::FlowSpend { action: FlowAction::Scrub });
    }

    // EndTurn is always available
    choices.push(Choice::EndTurn);

    choices
}

fn enumerate_stage_break_choices(state: &GameState) -> Vec<Choice> {
    let player = &state.players[state.current_player_index];
    let mut choices = Vec::new();

    // Check each upgrade for affordability and not already owned
    for &upgrade in UpgradeType::all() {
        if player.flow >= upgrade.flow_cost() && !player.upgrades.contains(&upgrade) {
            // Factory Suspension only useful on Pro Line — skip if player committed Main this round
            if upgrade == UpgradeType::FactorySuspension && player.commitment != Commitment::Pro {
                continue;
            }
            choices.push(Choice::BuyUpgrade { upgrade });
        }
    }

    // Always can pass / end turn
    choices.push(Choice::EndTurn);

    choices
}

/// Check whether a specific choice is legal in the current state.
/// Used by ISMCTS for availability tracking during selection.
pub fn choice_is_available(state: &GameState, choice: &Choice) -> bool {
    let choices = enumerate_choices(state);
    choices.contains(choice)
}

/// Refine an abstract choice into a concrete one that can be passed to
/// `process_action`. Abstract choices (`SteerBest`, `TechniqueBest`) are
/// resolved using game-state heuristics; concrete choices pass through
/// unchanged.
pub fn refine_choice(state: &GameState, choice: &Choice, rng: &mut impl rand::Rng) -> Choice {
    match choice {
        Choice::SteerBest => refine_steer(state, rng),
        Choice::TechniqueBest => refine_technique(state, rng),
        other => *other,
    }
}

/// Pick the best concrete steer: move the token that is farthest from its
/// alignment target lane. Ties broken randomly.
fn refine_steer(state: &GameState, rng: &mut impl rand::Rng) -> Choice {

    let player = &state.players[state.current_player_index];

    // Build target map from active trail card
    let mut targets: [Option<usize>; NUM_ROWS] = [None; NUM_ROWS];
    if let Some(trail) = &state.active_trail_card {
        let rows = trail.checked_rows();
        let lanes = trail.target_lanes();
        for i in 0..rows.len() {
            if rows[i] < NUM_ROWS {
                targets[rows[i]] = Some(lanes[i]);
            }
        }
    }

    // Score each possible steer: prefer moving toward target on checked rows
    let mut candidates: Vec<(Choice, i32)> = Vec::new();

    for row in 0..NUM_ROWS {
        if let Some(col) = get_token_col(&player.grid, row) {
            for dir in [-1i32, 1] {
                let new_col = col as i32 + dir;
                if new_col < 0 || new_col >= NUM_COLS as i32 {
                    continue;
                }
                let steer = Choice::Steer { row, direction: dir };

                let score = if let Some(target) = targets[row] {
                    let old_dist = (col as i32 - target as i32).abs();
                    let new_dist = (new_col - target as i32).abs();
                    // Higher score = better. Reducing distance is good.
                    (old_dist - new_dist) * 10 + old_dist
                } else {
                    // Non-checked row: slight preference toward center (col 2)
                    let old_dist = (col as i32 - 2).abs();
                    let new_dist = (new_col - 2).abs();
                    old_dist - new_dist
                };

                candidates.push((steer, score));
            }
        }
    }

    if candidates.is_empty() {
        return Choice::EndTurn;
    }

    // Pick the best score, breaking ties randomly
    let best_score = candidates.iter().map(|(_, s)| *s).max().unwrap();
    let best: Vec<_> = candidates
        .into_iter()
        .filter(|(_, s)| *s == best_score)
        .collect();
    best.choose(rng).unwrap().0
}

/// Pick a concrete technique card to play. Prefer cards whose symbol is most
/// abundant in hand (preserving diversity for obstacle matching).
fn refine_technique(state: &GameState, rng: &mut impl rand::Rng) -> Choice {

    let player = &state.players[state.current_player_index];

    if player.hand.is_empty() {
        return Choice::EndTurn;
    }

    // Count symbols in hand
    let mut counts = [0u32; 4];
    for card in &player.hand {
        counts[symbol_index(card.symbol())] += 1;
    }

    // Pick the card with the most-abundant symbol (playing it loses least diversity)
    let mut best_count = 0;
    let mut candidates: Vec<usize> = Vec::new();
    for (i, card) in player.hand.iter().enumerate() {
        let c = counts[symbol_index(card.symbol())];
        if c > best_count {
            best_count = c;
            candidates.clear();
            candidates.push(i);
        } else if c == best_count {
            candidates.push(i);
        }
    }

    let &card_index = candidates.choose(rng).unwrap_or(&0);
    Choice::Technique { card_index }
}
