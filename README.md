# Descenders

A board game simulation for Descenders, a downhill mountain biking race game. Includes a web app for interactive play and simulation, a Rust ISMCTS AI player compiled to WebAssembly, a batch game runner for data collection, and an analysis dashboard.

## Prerequisites

- **Node.js** (v20+) and npm
- **Rust** toolchain (`rustup`, stable channel)
- **wasm-pack** (`cargo install wasm-pack`)

## Web App

```bash
npm install
npm run dev
```

Opens at http://localhost:3000. The `/play` page runs interactive games and `/simulate` runs batch simulations in the browser (including with the MCTS AI strategy).

### Production build

```bash
npm run build
npm start
```

## Building WASM

The ISMCTS AI runs as Rust compiled to WebAssembly. The pre-built WASM binary is checked into `src/ai/wasm-pkg/` for deployment. Rebuild it after changing any Rust source in `descenders-core/`:

```bash
npm run build:wasm
```

A pre-commit hook automatically rebuilds WASM when Rust source files change.

## Game Runner

Run batch game simulations with the ISMCTS AI and save structured JSON game logs:

```bash
cargo run -p descenders-runner --release -- [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--games N` | 100 | Total number of games to run |
| `--players N` | 4 | Number of players per game |
| `--iterations N` | 1000 | ISMCTS iterations per decision |
| `--threads N` | 8 | Number of parallel threads |
| `--output DIR` | `game-logs` | Output directory for game logs |
| `--trail ID` | whistler-a-line | Trail pack (`whistler-a-line` or `tiger-mountain`) |

Example:

```bash
# Run 200 games with 2 players and 500 ISMCTS iterations
cargo run -p descenders-runner --release -- --games 200 --players 2 --iterations 500
```

Game logs are saved as JSON files in the output directory with the naming convention `game-{timestamp}-{batchId}-{gameId}.json`.

## Analysis Dashboard

A native desktop application (egui) for analyzing game log data:

```bash
cargo run -p descenders-gui
```

The dashboard automatically loads game logs from the `game-logs/` directory in the current working directory. It includes:

- **Game Analysis tab** -- aggregate statistics, win rates by position, distribution histograms, sprint action frequency, commitment analysis (main vs pro line), upgrade purchases, winners vs losers comparison
- **Game Viewer tab** -- load and inspect individual game log files with full decision history

## Profiling

Profile the game runner with samply:

```bash
npm run profile
```

This runs a single game with 10,000 ISMCTS iterations under samply for performance analysis.

## Project Structure

```
descenders-core/    Rust crate: game engine, types, ISMCTS algorithm
descenders-wasm/    Rust crate: wasm-bindgen bridge for browser
descenders-runner/  Rust crate: batch simulation CLI
descenders-gui/     Rust crate: egui analysis dashboard
src/                Next.js web application
  ai/              WASM integration (worker, controller, built pkg)
  lib/             Game engine (TypeScript), AI strategies, simulation
  app/             Next.js pages (play, simulate)
```
