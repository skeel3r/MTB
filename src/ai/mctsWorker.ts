/// Web Worker for running ISMCTS via WASM

import { initWasmEngine, runIsmcts, getLegalActions } from '../lib/wasm-engine';

let initialized = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, gameState, playerIndex, iterations } = e.data;

  try {
    if (!initialized) {
      await initWasmEngine();
      initialized = true;
    }

    if (type === 'run') {
      const action = runIsmcts(gameState, playerIndex, iterations);

      if ('error' in action) {
        self.postMessage({ type: 'error', message: (action as { error: string }).error });
      } else {
        self.postMessage({ type: 'success', action });
      }
    } else if (type === 'legal_actions') {
      const actions = getLegalActions(gameState);
      self.postMessage({ type: 'success', actions });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
