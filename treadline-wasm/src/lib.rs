use wasm_bindgen::prelude::*;
use wyrand::WyRand;

use treadline_core::types::*;
use treadline_core::ismcts::ismcts;
use treadline_core::choices::enumerate_choices;

/// Run ISMCTS from the given game state and return a GameAction JSON string.
#[wasm_bindgen]
pub fn wasm_run_ismcts(game_state_json: &str, player_index: u32, iterations: u32) -> String {
    let state: GameState = match serde_json::from_str(game_state_json) {
        Ok(s) => s,
        Err(e) => return serde_json::to_string(&serde_json::json!({
            "error": format!("Failed to deserialize game state: {}", e)
        })).unwrap(),
    };

    let seed = (js_sys::Math::random() * u64::MAX as f64) as u64;
    let mut rng = WyRand::new(seed);

    let choice = ismcts(&state, player_index as usize, iterations, &mut rng);

    let action = choice.to_game_action();
    serde_json::to_string(&action).unwrap()
}

/// Get all legal actions for the current player as a JSON array of GameAction.
#[wasm_bindgen]
pub fn wasm_get_legal_actions(game_state_json: &str) -> String {
    let state: GameState = match serde_json::from_str(game_state_json) {
        Ok(s) => s,
        Err(e) => return serde_json::to_string(&serde_json::json!({
            "error": format!("Failed to deserialize game state: {}", e)
        })).unwrap(),
    };

    let choices = enumerate_choices(&state);
    let actions: Vec<GameAction> = choices.iter().map(|c| c.to_game_action()).collect();
    serde_json::to_string(&actions).unwrap()
}
