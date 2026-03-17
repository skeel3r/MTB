import type { GameState, GameAction } from '../lib/types';

/**
 * Controller for the MCTS AI Web Worker.
 * Provides a promise-based API for getting AI choices.
 */
export class MctsController {
  private worker: Worker | null = null;
  private pendingResolve: ((action: GameAction) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./mctsWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e: MessageEvent) => {
        const { type, action, message } = e.data;
        if (type === 'success' && this.pendingResolve) {
          this.pendingResolve(action);
          this.pendingResolve = null;
          this.pendingReject = null;
        } else if (type === 'error' && this.pendingReject) {
          this.pendingReject(new Error(message));
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      };
      this.worker.onerror = (e) => {
        if (this.pendingReject) {
          this.pendingReject(new Error(e.message));
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      };
    }
    return this.worker;
  }

  /**
   * Get an ISMCTS-chosen action for the given game state.
   */
  getChoice(
    state: GameState,
    playerIndex: number,
    iterations: number = 1000,
  ): Promise<GameAction> {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      const worker = this.ensureWorker();
      worker.postMessage({
        type: 'run',
        gameState: state,
        playerIndex,
        iterations,
      });
    });
  }

  /**
   * Clean up the worker.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingResolve = null;
    this.pendingReject = null;
  }
}
