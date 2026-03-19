import { describe, bench, beforeAll } from 'vitest';
import { initWasmEngine, runIsmcts } from '../lib/wasm-engine';
import { setupCommitmentGame, setupSprintGame } from './benchHelper';

// Initialize WASM engine before benchmarks run
beforeAll(async () => {
  await initWasmEngine();
});

function runWasm(state: object, playerIndex: number, iterations: number): object {
  return runIsmcts(state as Parameters<typeof runIsmcts>[0], playerIndex, iterations);
}

describe('Commitment Phase', () => {
  const state = setupCommitmentGame(4);

  bench('run_ismcts 1 iteration', () => {
    runWasm(state, 0, 1);
  });

  bench('run_ismcts 100 iterations', () => {
    runWasm(state, 0, 100);
  });

  bench('run_ismcts 1000 iterations', () => {
    runWasm(state, 0, 1000);
  });

  bench('run_ismcts 10000 iterations', () => {
    runWasm(state, 0, 10000);
  });
});

describe('Sprint Phase', () => {
  const state = setupSprintGame(4);

  bench('run_ismcts 1 iteration', () => {
    runWasm(state, 0, 1);
  });

  bench('run_ismcts 100 iterations', () => {
    runWasm(state, 0, 100);
  });

  bench('run_ismcts 1000 iterations', () => {
    runWasm(state, 0, 1000);
  });

  bench('run_ismcts 10000 iterations', () => {
    runWasm(state, 0, 10000);
  });
});
