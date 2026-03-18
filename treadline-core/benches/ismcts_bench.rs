use criterion::{criterion_group, criterion_main, Criterion};
use wyrand::WyRand;

use treadline_core::engine::{advance_phase, init_game, process_action};
use treadline_core::ismcts::ismcts;
use treadline_core::types::*;

fn setup_commitment_game(num_players: usize) -> GameState {
    let mut rng = WyRand::new(42);
    let mut state = init_game(num_players, None, &mut rng);

    // Advance through setup -> scroll_descent -> commitment
    while state.phase != GamePhase::Commitment {
        advance_phase(&mut state, &mut rng);
    }

    state
}

fn setup_sprint_game(num_players: usize) -> GameState {
    let mut rng = WyRand::new(42);
    let mut state = setup_commitment_game(num_players);

    // Commit all players to main line
    for i in 0..num_players {
        state.current_player_index = i;
        process_action(
            &mut state,
            i,
            &Choice::CommitLine {
                line: Commitment::Main,
            },
            &mut rng,
        );
    }

    // Advance through commitment -> environment -> preparation -> sprint
    while state.phase != GamePhase::Sprint {
        advance_phase(&mut state, &mut rng);
    }

    state
}

fn benchmarks(c: &mut Criterion) {
    let commitment_state = setup_commitment_game(4);
    let sprint_state = setup_sprint_game(4);

    c.bench_function("commitment_ismcts_1", |b| {
        let mut rng = WyRand::new(42);
        b.iter(|| ismcts(&commitment_state, 0, 1, &mut rng));
    });

    c.bench_function("commitment_ismcts_100", |b| {
        let mut rng = WyRand::new(42);
        b.iter(|| ismcts(&commitment_state, 0, 100, &mut rng));
    });

    c.bench_function("commitment_ismcts_1000", |b| {
        let mut rng = WyRand::new(42);
        b.iter(|| ismcts(&commitment_state, 0, 1000, &mut rng));
    });

    c.bench_function("sprint_ismcts_1", |b| {
        let mut rng = WyRand::new(42);
        b.iter(|| ismcts(&sprint_state, 0, 1, &mut rng));
    });

    c.bench_function("sprint_ismcts_100", |b| {
        let mut rng = WyRand::new(42);
        b.iter(|| ismcts(&sprint_state, 0, 100, &mut rng));
    });

    c.bench_function("sprint_ismcts_1000", |b| {
        let mut rng = WyRand::new(42);
        b.iter(|| ismcts(&sprint_state, 0, 1000, &mut rng));
    });
}

criterion_group!(benches, benchmarks);
criterion_main!(benches);
