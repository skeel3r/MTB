/**
 * WASM Engine Bridge
 *
 * Drop-in replacement for engine.ts that routes all game logic through the
 * Rust/WASM engine. Call `initWasmEngine()` once at app startup before
 * using any other functions.
 */

import { GameState, GameAction, PlayerState } from './types';

// ── WASM module references ──

let wasmModule: {
  wasm_init_game: (names_json: string, trail_id: string) => string;
  wasm_process_action: (state_json: string, player_index: number, action_json: string) => string;
  wasm_advance_phase: (state_json: string) => string;
  wasm_get_standings: (state_json: string) => string;
  wasm_get_winner: (state_json: string) => string;
  wasm_run_ismcts: (state_json: string, player_index: number, iterations: number) => string;
  wasm_get_legal_actions: (state_json: string) => string;
} | null = null;

let initPromise: Promise<void> | null = null;

// ── Initialization ──

export async function initWasmEngine(): Promise<void> {
  if (wasmModule) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const wasm = await import('../ai/wasm-pkg/treadline_wasm.js');
    await wasm.default();
    wasmModule = {
      wasm_init_game: wasm.wasm_init_game,
      wasm_process_action: wasm.wasm_process_action,
      wasm_advance_phase: wasm.wasm_advance_phase,
      wasm_get_standings: wasm.wasm_get_standings,
      wasm_get_winner: wasm.wasm_get_winner,
      wasm_run_ismcts: wasm.wasm_run_ismcts,
      wasm_get_legal_actions: wasm.wasm_get_legal_actions,
    };
  })();

  return initPromise;
}

export function isWasmReady(): boolean {
  return wasmModule !== null;
}

function ensureWasm() {
  if (!wasmModule) {
    throw new Error('WASM engine not initialized. Call initWasmEngine() first.');
  }
  return wasmModule;
}

// ── Engine API (matches engine.ts signatures) ──

export function initGame(playerNames: string[], trailId?: string): GameState {
  const wasm = ensureWasm();
  const json = wasm.wasm_init_game(JSON.stringify(playerNames), trailId ?? '');
  return JSON.parse(json);
}

export function processAction(state: GameState, playerIndex: number, action: GameAction): GameState {
  const wasm = ensureWasm();
  const json = wasm.wasm_process_action(
    JSON.stringify(state),
    playerIndex,
    JSON.stringify(action),
  );
  return JSON.parse(json);
}

export function advancePhase(state: GameState): GameState {
  const wasm = ensureWasm();
  const json = wasm.wasm_advance_phase(JSON.stringify(state));
  return JSON.parse(json);
}

export interface StandingInfo {
  rank: number;
  playerIndex: number;
  name: string;
  shred: number;
  obstaclesCleared: number;
  perfectMatches: number;
  penalties: number;
  flow: number;
  momentum: number;
  totalCardsPlayed: number;
}

export function getStandings(state: GameState): StandingInfo[] {
  const wasm = ensureWasm();
  const json = wasm.wasm_get_standings(JSON.stringify(state));
  return JSON.parse(json);
}

export function getWinner(state: GameState): PlayerState | null {
  const wasm = ensureWasm();
  const json = wasm.wasm_get_winner(JSON.stringify(state));
  return JSON.parse(json);
}

// ── ISMCTS (already existed, now consolidated here) ──

export function runIsmcts(state: GameState, playerIndex: number, iterations: number): GameAction {
  const wasm = ensureWasm();
  const json = wasm.wasm_run_ismcts(JSON.stringify(state), playerIndex, iterations);
  return JSON.parse(json);
}

export function getLegalActions(state: GameState): GameAction[] {
  const wasm = ensureWasm();
  const json = wasm.wasm_get_legal_actions(JSON.stringify(state));
  return JSON.parse(json);
}

// ── Utility (pure TS, no engine dependency) ──

export function sortByShredRandomTies(players: { i: number; shred: number }[]): { i: number; shred: number }[] {
  // Shuffle first so ties are random (Fisher-Yates)
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  return players.sort((a, b) => b.shred - a.shred);
}
