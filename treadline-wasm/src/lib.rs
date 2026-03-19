use wasm_bindgen::prelude::*;
use wyrand::WyRand;

use treadline_core::types::*;
use treadline_core::ismcts::ismcts;
use treadline_core::choices::{enumerate_choices, refine_choice};
use treadline_core::engine::{advance_phase, init_game_with_names, process_action, get_standings};

fn make_rng() -> WyRand {
    let seed = (js_sys::Math::random() * u64::MAX as f64) as u64;
    WyRand::new(seed)
}

fn err_json(msg: String) -> String {
    serde_json::to_string(&serde_json::json!({ "error": msg })).unwrap()
}

fn parse_state(json: &str) -> Result<GameState, String> {
    serde_json::from_str(json).map_err(|e| format!("Failed to deserialize game state: {}", e))
}

// ── Existing ISMCTS functions ──

/// Run ISMCTS from the given game state and return a GameAction JSON string.
#[wasm_bindgen]
pub fn wasm_run_ismcts(game_state_json: &str, player_index: u32, iterations: u32) -> String {
    let state = match parse_state(game_state_json) {
        Ok(s) => s,
        Err(e) => return err_json(e),
    };

    let mut rng = make_rng();
    let choice = ismcts(&state, player_index as usize, iterations, &mut rng);
    let concrete = refine_choice(&state, &choice, &mut rng);

    let action = concrete.to_game_action();
    serde_json::to_string(&action).unwrap()
}

/// Get all legal actions for the current player as a JSON array of GameAction.
#[wasm_bindgen]
pub fn wasm_get_legal_actions(game_state_json: &str) -> String {
    let state = match parse_state(game_state_json) {
        Ok(s) => s,
        Err(e) => return err_json(e),
    };

    let choices = enumerate_choices(&state);
    let actions: Vec<GameAction> = choices.iter().map(|c| c.to_game_action()).collect();
    serde_json::to_string(&actions).unwrap()
}

// ── New engine functions ──

/// Initialize a new game. Takes a JSON array of player names and optional trail ID.
/// Returns the initial GameState as JSON.
#[wasm_bindgen]
pub fn wasm_init_game(player_names_json: &str, trail_id: &str) -> String {
    let names: Vec<String> = match serde_json::from_str(player_names_json) {
        Ok(n) => n,
        Err(e) => return err_json(format!("Failed to parse player names: {}", e)),
    };

    let trail = if trail_id.is_empty() { None } else { Some(trail_id) };
    let mut rng = make_rng();
    let state = init_game_with_names(&names, trail, &mut rng);

    serde_json::to_string(&state).unwrap()
}

/// Process a player action. Takes game state JSON, player index, and action JSON.
/// Returns the updated GameState as JSON.
#[wasm_bindgen]
pub fn wasm_process_action(game_state_json: &str, player_index: u32, action_json: &str) -> String {
    let mut state = match parse_state(game_state_json) {
        Ok(s) => s,
        Err(e) => return err_json(e),
    };

    let action: GameAction = match serde_json::from_str(action_json) {
        Ok(a) => a,
        Err(e) => return err_json(format!("Failed to parse action: {}", e)),
    };

    let choice = match action.to_choice() {
        Ok(c) => c,
        Err(e) => return err_json(format!("Failed to convert action to choice: {}", e)),
    };

    let mut rng = make_rng();
    process_action(&mut state, player_index as usize, &choice, &mut rng);

    serde_json::to_string(&state).unwrap()
}

/// Advance the game to the next phase. Returns the updated GameState as JSON.
#[wasm_bindgen]
pub fn wasm_advance_phase(game_state_json: &str) -> String {
    let mut state = match parse_state(game_state_json) {
        Ok(s) => s,
        Err(e) => return err_json(e),
    };

    let mut rng = make_rng();
    advance_phase(&mut state, &mut rng);

    serde_json::to_string(&state).unwrap()
}

/// Get standings sorted by ranking. Returns JSON array of standing objects.
#[wasm_bindgen]
pub fn wasm_get_standings(game_state_json: &str) -> String {
    let state = match parse_state(game_state_json) {
        Ok(s) => s,
        Err(e) => return err_json(e),
    };

    let standings = get_standings(&state);
    let result: Vec<serde_json::Value> = standings.iter().enumerate().map(|(rank, (idx, p))| {
        serde_json::json!({
            "rank": rank + 1,
            "playerIndex": idx,
            "name": p.name,
            "shred": p.shred,
            "obstaclesCleared": p.obstacles_cleared,
            "perfectMatches": p.perfect_matches,
            "penalties": p.penalties.len(),
            "flow": p.flow,
            "momentum": p.momentum,
        })
    }).collect();

    serde_json::to_string(&result).unwrap()
}

/// Get the winner (player with highest ranking). Returns player state JSON or null.
#[wasm_bindgen]
pub fn wasm_get_winner(game_state_json: &str) -> String {
    let state = match parse_state(game_state_json) {
        Ok(s) => s,
        Err(e) => return err_json(e),
    };

    if state.phase != GamePhase::GameOver {
        return "null".to_string();
    }

    let standings = get_standings(&state);
    if let Some((_, player)) = standings.first() {
        serde_json::to_string(player).unwrap()
    } else {
        "null".to_string()
    }
}
