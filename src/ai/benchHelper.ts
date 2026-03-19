import { initGame, advancePhase, processAction } from '../lib/wasm-engine';
import type { GameState } from '../lib/types';

export function setupCommitmentGame(numPlayers: number): GameState {
  const names = Array.from({ length: numPlayers }, (_, i) => `Player ${i + 1}`);
  let state = initGame(names);

  // Advance through setup -> scroll_descent -> commitment
  while (state.phase !== 'commitment') {
    state = advancePhase(state);
  }

  return state;
}

export function setupSprintGame(numPlayers: number): GameState {
  const state = setupCommitmentGame(numPlayers);

  // Commit all players to main line
  let s = state;
  for (let i = 0; i < numPlayers; i++) {
    s = processAction(s, i, { type: 'commit_line', payload: { line: 'main' } });
  }

  // Advance through commitment -> environment -> preparation -> sprint
  while (s.phase !== 'sprint') {
    s = advancePhase(s);
  }

  return s;
}
