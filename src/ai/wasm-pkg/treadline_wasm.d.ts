/* tslint:disable */
/* eslint-disable */

/**
 * Advance the game to the next phase. Returns the updated GameState as JSON.
 */
export function wasm_advance_phase(game_state_json: string): string;

/**
 * Get all legal actions for the current player as a JSON array of GameAction.
 */
export function wasm_get_legal_actions(game_state_json: string): string;

/**
 * Get standings sorted by ranking. Returns JSON array of standing objects.
 */
export function wasm_get_standings(game_state_json: string): string;

/**
 * Get the winner (player with highest ranking). Returns player state JSON or null.
 */
export function wasm_get_winner(game_state_json: string): string;

/**
 * Initialize a new game. Takes a JSON array of player names and optional trail ID.
 * Returns the initial GameState as JSON.
 */
export function wasm_init_game(player_names_json: string, trail_id: string): string;

/**
 * Process a player action. Takes game state JSON, player index, and action JSON.
 * Returns the updated GameState as JSON.
 */
export function wasm_process_action(game_state_json: string, player_index: number, action_json: string): string;

/**
 * Run ISMCTS from the given game state and return a GameAction JSON string.
 */
export function wasm_run_ismcts(game_state_json: string, player_index: number, iterations: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly wasm_advance_phase: (a: number, b: number) => [number, number];
    readonly wasm_get_legal_actions: (a: number, b: number) => [number, number];
    readonly wasm_get_standings: (a: number, b: number) => [number, number];
    readonly wasm_get_winner: (a: number, b: number) => [number, number];
    readonly wasm_init_game: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasm_process_action: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasm_run_ismcts: (a: number, b: number, c: number, d: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
