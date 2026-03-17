import { describe, bench } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initSync, wasm_run_ismcts } from './wasm-pkg/descenders_wasm';
import { setupCommitmentGame, setupSprintGame } from './benchHelper';

// Initialize WASM synchronously for Node.js (vitest) environment
const wasmPath = resolve(__dirname, './wasm-pkg/descenders_wasm_bg.wasm');
const wasmBytes = readFileSync(wasmPath);
initSync({ module: new WebAssembly.Module(wasmBytes) });

function runWasm(state: object, playerIndex: number, iterations: number): object {
  const json = JSON.stringify(state);
  const resultJson = wasm_run_ismcts(json, playerIndex, iterations);
  return JSON.parse(resultJson);
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
