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
        if !player.cannot_brake && player.commitment != Commitment::Pro && player.momentum > 0 {
            choices.push(Choice::Brake);
        }

        // Steer: for each row with a token not at the edge in that direction
        for row in 0..NUM_ROWS {
            if let Some(col) = get_token_col(&player.grid, row) {
                // Can steer left if not at left edge
                if col > 0 {
                    choices.push(Choice::Steer { row, direction: -1 });
                }
                // Can steer right if not at right edge
                if col < NUM_COLS - 1 {
                    choices.push(Choice::Steer { row, direction: 1 });
                }
            }
        }

        // Technique cards
        for card_index in 0..player.hand.len() {
            choices.push(Choice::Technique { card_index });
        }
    }

    // DrawObstacle (free action)
    if !state.obstacle_deck.is_empty() || !state.obstacle_discard.is_empty() {
        choices.push(Choice::DrawObstacle);
    }

    // ReuseObstacle (only if player hasn't drawn a fresh obstacle this turn)
    if !player.drew_fresh_obstacle {
        for revealed_index in 0..state.round_revealed_obstacles.len() {
            choices.push(Choice::ReuseObstacle { revealed_index });
        }
    }

    // Flow spends
    if player.flow >= 1 && player.hazard_dice > 0 {
        choices.push(Choice::FlowSpend { action: FlowAction::Reroll });
    }
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
