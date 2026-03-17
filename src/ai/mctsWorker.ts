/// Web Worker for running ISMCTS via WASM

import init, { wasm_run_ismcts, wasm_get_legal_actions } from './wasm-pkg/descenders_wasm.js';

let initialized = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, gameState, playerIndex, iterations } = e.data;

  try {
    if (!initialized) {
      await init();
      initialized = true;
    }

    if (type === 'run') {
      const gameStateJson = JSON.stringify(gameState);
      const resultJson = wasm_run_ismcts(gameStateJson, playerIndex, iterations);
      const action = JSON.parse(resultJson);

      if (action.error) {
        self.postMessage({ type: 'error', message: action.error });
      } else {
        self.postMessage({ type: 'success', action });
      }
    } else if (type === 'legal_actions') {
      const gameStateJson = JSON.stringify(gameState);
      const resultJson = wasm_get_legal_actions(gameStateJson);
      const actions = JSON.parse(resultJson);
      self.postMessage({ type: 'success', actions });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
