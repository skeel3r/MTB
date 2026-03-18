use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use clap::Parser;
use rand::prelude::*;
use wyrand::WyRand;

use treadline_core::choices::{enumerate_choices, refine_choice};
use treadline_core::engine::{advance_phase, init_game, process_action};
use treadline_core::ismcts::ismcts_with_policy;
use treadline_core::scoring::compute_terminal_rewards;
use treadline_core::types::*;

// ── CLI ──

#[derive(Parser)]
#[command(name = "treadline-runner", about = "Run batch game simulations with ISMCTS AI")]
struct Args {
    /// Total number of games to run
    #[arg(long, default_value_t = 100)]
    games: usize,

    /// Number of players per game
    #[arg(long, default_value_t = 4)]
    players: usize,

    /// ISMCTS iterations per decision
    #[arg(long, default_value_t = 2000)]
    iterations: u32,

    /// Number of parallel threads
    #[arg(long, default_value_t = 8)]
    threads: usize,

    /// Output directory for game logs
    #[arg(long, default_value = "game-logs")]
    output: String,

    /// Trail pack ID (e.g. "tiger-mountain")
    #[arg(long)]
    trail: Option<String>,

    /// Rollout policy: "heuristic" (default) or "random"
    #[arg(long, default_value = "heuristic")]
    rollout: String,
}

// ── Helpers ──

fn now_epoch_secs_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string()
}

fn now_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Pick the best action: use ISMCTS, but fall back to a random legal choice
/// if ISMCTS returns something not in the current legal set.
fn pick_choice(
    state: &GameState,
    player_index: usize,
    choices: &[Choice],
    iterations: u32,
    policy: RolloutPolicy,
    rng: &mut WyRand,
) -> Choice {
    if choices.len() == 1 {
        return choices[0].clone();
    }
    let choice = ismcts_with_policy(state, player_index, iterations, policy, rng);
    if choices.contains(&choice) {
        choice
    } else {
        choices.choose(rng).unwrap().clone()
    }
}

fn generate_id(rng: &mut impl Rng, len: usize) -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    (0..len)
        .map(|_| CHARSET[rng.random_range(0..CHARSET.len())] as char)
        .collect()
}

// ── Game loop ──

fn run_game(
    num_players: usize,
    trail_id: Option<&str>,
    iterations: u32,
    policy: RolloutPolicy,
    rng: &mut WyRand,
) -> GameRunOutput {
    let start = Instant::now();
    let game_started_at = now_epoch_secs_string();

    let mut state = init_game(num_players, trail_id, rng);
    let initial_state = state.clone();
    let player_names: Vec<String> = (1..=num_players)
        .map(|i| format!("Player {}", i))
        .collect();

    let mut entries: Vec<StructuredLogEntry> = Vec::new();
    let mut seq: u32 = 0;

    let mut safety = 100_000;
    while state.phase != GamePhase::GameOver && safety > 0 {
        safety -= 1;

        match state.phase {
            // Non-decision phases: auto-advance
            GamePhase::Setup
            | GamePhase::ScrollDescent
            | GamePhase::Environment
            | GamePhase::Preparation
            | GamePhase::Alignment
            | GamePhase::Reckoning => {
                advance_phase(&mut state, rng);
            }

            // Commitment: each player chooses main or pro
            GamePhase::Commitment => {
                for pi in 0..num_players {
                    state.current_player_index = pi;
                    let choices = enumerate_choices(&state);
                    let choice = pick_choice(&state, pi, &choices, iterations, policy, rng);

                    let concrete = refine_choice(&state, &choice, rng);

                    seq += 1;
                    entries.push(StructuredLogEntry {
                        seq,
                        round: state.round,
                        phase: "commitment".to_string(),
                        player_index: pi,
                        choice: concrete.clone(),
                    });

                    process_action(&mut state, pi, &concrete, rng);
                }
                advance_phase(&mut state, rng); // -> Environment
            }

            // Sprint: current player takes actions until turn ends
            GamePhase::Sprint => {
                // Build turn order: sort by progress descending (shuffle for tiebreak)
                let mut order: Vec<(usize, i32)> = state
                    .players
                    .iter()
                    .enumerate()
                    .map(|(i, p)| (i, p.shred))
                    .collect();
                order.shuffle(rng);
                order.sort_by(|a, b| b.1.cmp(&a.1));
                let turn_order: Vec<usize> = order.into_iter().map(|(i, _)| i).collect();

                for &pi in &turn_order {
                    state.current_player_index = pi;

                    let mut turn_safety = 200;
                    while !state.players[pi].crashed
                        && !state.players[pi].turn_ended
                        && turn_safety > 0
                    {
                        turn_safety -= 1;
                        let choices = enumerate_choices(&state);
                        if choices.is_empty() {
                            break;
                        }

                        let choice = pick_choice(&state, pi, &choices, iterations, policy, rng);
                        let concrete = refine_choice(&state, &choice, rng);

                        seq += 1;
                        entries.push(StructuredLogEntry {
                            seq,
                            round: state.round,
                            phase: "sprint".to_string(),
                            player_index: pi,
                            choice: concrete.clone(),
                        });

                        process_action(&mut state, pi, &concrete, rng);
                    }
                }
                advance_phase(&mut state, rng); // -> Alignment
            }

            // StageBreak: each player can buy upgrades or pass
            GamePhase::StageBreak => {
                for pi in 0..num_players {
                    state.current_player_index = pi;

                    let mut break_safety = 20;
                    loop {
                        if break_safety == 0 {
                            break;
                        }
                        break_safety -= 1;

                        let choices = enumerate_choices(&state);
                        if choices.is_empty() {
                            break;
                        }

                        let choice = pick_choice(&state, pi, &choices, iterations, policy, rng);
                        let concrete = refine_choice(&state, &choice, rng);

                        seq += 1;
                        entries.push(StructuredLogEntry {
                            seq,
                            round: state.round,
                            phase: "stage_break".to_string(),
                            player_index: pi,
                            choice: concrete.clone(),
                        });

                        let is_end = matches!(concrete, Choice::EndTurn);
                        process_action(&mut state, pi, &concrete, rng);
                        if is_end {
                            break;
                        }
                    }
                }
                advance_phase(&mut state, rng); // -> ScrollDescent or GameOver
            }

            GamePhase::GameOver => break,
        }
    }

    // Compute final standings
    let rewards = compute_terminal_rewards(&state);
    let final_standings: Vec<FinalStanding> = state
        .players
        .iter()
        .enumerate()
        .map(|(i, p)| FinalStanding {
            name: player_names[i].clone(),
            obstacles_cleared: p.obstacles_cleared,
            shred: p.shred,
            perfect_matches: p.perfect_matches,
            penalties: p.penalties.len() as i32,
            flow: p.flow,
            momentum: p.momentum,
            reward: rewards.get(i).copied().unwrap_or(0.0),
            upgrade_activations: p.upgrade_activations.iter().map(|(u, c)| (u.name().to_string(), *c)).collect(),
            flow_from_alignment: p.flow_from_alignment,
            flow_from_other: p.flow_from_other,
            flow_spent_upgrades: p.flow_spent_upgrades,
            flow_spent_abilities: p.flow_spent_abilities,
            hazard_from_misalignment: p.hazard_from_misalignment,
            alignment_checks: p.alignment_checks,
            alignment_hits: p.alignment_hits,
        })
        .collect();

    let duration_ms = start.elapsed().as_millis() as u64;

    GameRunOutput {
        version: 1,
        game_started_at,
        game_ended_at: now_epoch_secs_string(),
        player_names,
        iterations,
        num_players: num_players as u32,
        trail_id: initial_state.trail_id.clone(),
        initial_state,
        final_standings,
        entries,
        duration_ms,
    }
}

// ── Main ──

fn main() {
    let args = Args::parse();

    let policy = match args.rollout.as_str() {
        "random" => RolloutPolicy::Random,
        _ => RolloutPolicy::Heuristic,
    };

    eprintln!(
        "Running {} games with {} players, {} ISMCTS iterations, {} threads, {:?} rollout",
        args.games, args.players, args.iterations, args.threads, policy
    );

    std::fs::create_dir_all(&args.output).expect("Failed to create output directory");

    let mut id_rng = WyRand::new(now_epoch_millis());
    let batch_id = generate_id(&mut id_rng, 6);
    let completed = AtomicUsize::new(0);
    let total_games = args.games;
    let num_threads = args.threads.min(total_games).max(1);

    std::thread::scope(|s| {
        let games_per_thread = total_games / num_threads;
        let remainder = total_games % num_threads;
        let mut handles = Vec::new();

        for t in 0..num_threads {
            let count = games_per_thread + if t < remainder { 1 } else { 0 };
            let completed = &completed;
            let output_dir = &args.output;
            let batch_id = &batch_id;
            let trail = args.trail.as_deref();
            let num_players = args.players;
            let iterations = args.iterations;

            handles.push(s.spawn(move || {
                let mut rng = WyRand::new(now_epoch_millis().wrapping_add(t as u64 * 1000));

                for _ in 0..count {
                    let log = run_game(num_players, trail, iterations, policy, &mut rng);

                    let epoch_millis = now_epoch_millis();
                    let game_id = generate_id(&mut rng, 4);
                    let path = format!(
                        "{}/game-{}-{}-{}.json",
                        output_dir, epoch_millis, batch_id, game_id
                    );
                    let json = serde_json::to_string_pretty(&log).unwrap();
                    std::fs::write(&path, json).unwrap();

                    let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                    eprintln!("Game {}/{} complete ({}ms)", done, total_games, log.duration_ms);
                }
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }
    });

    eprintln!("All {} games written to {}/", total_games, args.output);
}
