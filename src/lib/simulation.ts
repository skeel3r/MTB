import { GameState, SimulationConfig, SimulationResult } from './types';
import { initGame, advancePhase, processAction, getStandings } from './engine';

type Strategy = SimulationConfig['strategy'];

function aiTakeTurn(state: GameState, playerIndex: number, strategy: Strategy): GameState {
  let s = { ...state };
  const player = s.players[playerIndex];

  // Commit to line
  if (strategy === 'aggressive') {
    s = processAction(s, playerIndex, { type: 'commit_line', payload: { line: 'pro' } });
  } else {
    s = processAction(s, playerIndex, { type: 'commit_line', payload: { line: 'main' } });
  }

  // Sprint phase actions
  let actions = 5;
  const p = s.players[playerIndex];

  // Strategy-based actions
  while (actions > 0 && !p.crashed && !p.turnEnded) {
    if (strategy === 'aggressive') {
      // Aggressive: pedal first, then tackle everything
      if (actions > 2 && p.momentum < 5) {
        s = processAction(s, playerIndex, { type: 'pedal' });
        actions--;
      } else if (s.activeTrailCard && s.activeTrailCard.obstacleSymbols.length > 0) {
        s = processAction(s, playerIndex, { type: 'tackle', payload: { obstacleIndex: 0 } });
        // tackle is free
      } else {
        s = processAction(s, playerIndex, { type: 'pedal' });
        actions--;
      }
    } else if (strategy === 'conservative') {
      // Conservative: steer toward center, brake if fast, tackle cautiously
      if (p.momentum > 3 && actions > 0) {
        s = processAction(s, playerIndex, { type: 'brake' });
        actions--;
      } else if (s.activeTrailCard && s.activeTrailCard.obstacleSymbols.length > 0) {
        // Only tackle if we have a matching card
        const obstacle = s.activeTrailCard.obstacleSymbols[0];
        const hasMatch = p.hand.some(c => c.symbol === obstacle);
        if (hasMatch) {
          s = processAction(s, playerIndex, { type: 'tackle', payload: { obstacleIndex: 0 } });
        } else {
          // Steer toward center instead
          for (let r = 0; r < 6; r++) {
            const col = getTokenCol(p.grid, r);
            if (col >= 0 && col !== 2 && actions > 0) {
              const dir = col > 2 ? -1 : 1;
              s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
              actions--;
              break;
            }
          }
          if (actions > 0) {
            s = processAction(s, playerIndex, { type: 'pedal' });
            actions--;
          }
        }
      } else if (actions > 0) {
        s = processAction(s, playerIndex, { type: 'pedal' });
        actions--;
      }
    } else {
      // Balanced: mix of pedal and tackle
      if (s.activeTrailCard && s.activeTrailCard.obstacleSymbols.length > 0) {
        s = processAction(s, playerIndex, { type: 'tackle', payload: { obstacleIndex: 0 } });
      } else if (actions > 0) {
        if (p.momentum < 4) {
          s = processAction(s, playerIndex, { type: 'pedal' });
        } else {
          // Steer
          for (let r = 0; r < 6; r++) {
            const col = getTokenCol(p.grid, r);
            if (col >= 0 && col !== 2) {
              const dir = col > 2 ? -1 : 1;
              s = processAction(s, playerIndex, { type: 'steer', payload: { row: r, direction: dir } });
              break;
            }
          }
        }
        actions--;
      }
    }

    // Safety: if no obstacles left and few actions, end
    if (s.activeTrailCard && s.activeTrailCard.obstacleSymbols.length === 0 && actions <= 1) {
      break;
    }
  }

  s = processAction(s, playerIndex, { type: 'end_turn' });
  return s;
}

function getTokenCol(grid: boolean[][], row: number): number {
  for (let c = 0; c < 5; c++) {
    if (grid[row][c]) return c;
  }
  return -1;
}

export function runSimulation(config: SimulationConfig): SimulationResult[] {
  const results: SimulationResult[] = [];
  const playerNames = Array.from({ length: config.playerCount }, (_, i) => `Player ${i + 1}`);

  for (let game = 0; game < config.gamesCount; game++) {
    let state = initGame(playerNames);

    // Run through 15 rounds
    for (let round = 0; round < 15; round++) {
      // Scroll & Descent
      state = advancePhase(state);

      // Commitment (auto for simulation)
      state = advancePhase(state);
      for (let i = 0; i < state.players.length; i++) {
        const line = config.strategy === 'aggressive' ? 'pro' : 'main';
        state = processAction(state, i, { type: 'commit_line', payload: { line } });
      }

      // Environment
      state = advancePhase(state);

      // Preparation
      state = advancePhase(state);

      // Sprint - each player takes turn
      state = advancePhase(state);
      for (let i = 0; i < state.players.length; i++) {
        state = aiTakeTurn(state, i, config.strategy);
      }

      // Alignment
      state = advancePhase(state);

      // Reckoning
      state = advancePhase(state);
    }

    state.phase = 'game_over';
    const standings = getStandings(state);

    results.push({
      gameNumber: game + 1,
      winner: standings[0].name,
      finalStandings: standings.map(s => ({
        name: s.name,
        progress: s.progress,
        perfectMatches: s.perfectMatches,
        penalties: s.penalties,
        flow: s.flow,
        momentum: s.momentum,
      })),
      totalRounds: state.round,
    });
  }

  return results;
}
