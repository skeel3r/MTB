use std::collections::HashMap;

use descenders_core::types::{Choice, Commitment, GameRunOutput};

/// All computed analysis results, cached until logs change.
pub struct AnalysisResults {
    pub game_count: usize,
    pub avg_duration_ms: f64,
    pub avg_rounds: f64,
    pub avg_obstacles_cleared: f64,
    pub avg_progress: f64,
    pub avg_penalties: f64,

    pub win_rate_by_position: Vec<(String, f64, usize)>, // (label, rate, count)

    pub obstacles_cleared_distribution: Vec<(i32, usize)>, // (value, count)
    pub progress_distribution: Vec<(i32, usize)>,
    pub penalty_distribution: Vec<(i32, usize)>,

    pub sprint_action_frequency: Vec<(String, usize)>, // (action, count)
    pub commitment_stats: CommitmentStats,
    pub upgrade_frequency: Vec<(String, usize)>, // (upgrade description, count)

    pub winners_vs_losers: WinnersVsLosers,
}

pub struct CommitmentStats {
    pub main_count: usize,
    pub pro_count: usize,
    pub main_win_rate: f64,
    pub pro_win_rate: f64,
}

pub struct WinnersVsLosers {
    pub winner_avg_obstacles: f64,
    pub loser_avg_obstacles: f64,
    pub winner_avg_progress: f64,
    pub loser_avg_progress: f64,
    pub winner_avg_penalties: f64,
    pub loser_avg_penalties: f64,
    pub winner_avg_flow: f64,
    pub loser_avg_flow: f64,
    pub winner_avg_momentum: f64,
    pub loser_avg_momentum: f64,
}

pub fn compute_analysis(logs: &[&GameRunOutput]) -> AnalysisResults {
    let game_count = logs.len();
    if game_count == 0 {
        return empty_results();
    }

    // Overview
    let avg_duration_ms = logs.iter().map(|l| l.duration_ms as f64).sum::<f64>() / game_count as f64;
    let avg_rounds = logs.iter().map(|l| {
        l.entries.iter().map(|e| e.round).max().unwrap_or(0) as f64
    }).sum::<f64>() / game_count as f64;

    let all_standings: Vec<_> = logs.iter().flat_map(|l| l.final_standings.iter()).collect();
    let total_players = all_standings.len().max(1) as f64;
    let avg_obstacles_cleared = all_standings.iter().map(|s| s.obstacles_cleared as f64).sum::<f64>() / total_players;
    let avg_progress = all_standings.iter().map(|s| s.progress as f64).sum::<f64>() / total_players;
    let avg_penalties = all_standings.iter().map(|s| s.penalties as f64).sum::<f64>() / total_players;

    // Win rate by position
    let num_players = logs.first().map(|l| l.num_players as usize).unwrap_or(2);
    let mut position_wins = vec![0usize; num_players];
    let mut position_games = vec![0usize; num_players];
    for log in logs {
        for (i, s) in log.final_standings.iter().enumerate() {
            if i < num_players {
                position_games[i] += 1;
                if s.reward > 0.99 {
                    position_wins[i] += 1;
                }
            }
        }
    }
    let win_rate_by_position: Vec<_> = (0..num_players)
        .map(|i| {
            let rate = if position_games[i] > 0 {
                position_wins[i] as f64 / position_games[i] as f64
            } else {
                0.0
            };
            (format!("Player {}", i + 1), rate, position_games[i])
        })
        .collect();

    // Distributions
    let obstacles_cleared_distribution = build_distribution(
        all_standings.iter().map(|s| s.obstacles_cleared),
    );
    let progress_distribution = build_distribution(
        all_standings.iter().map(|s| s.progress),
    );
    let penalty_distribution = build_distribution(
        all_standings.iter().map(|s| s.penalties),
    );

    // Sprint action frequency
    let mut action_counts: HashMap<String, usize> = HashMap::new();
    for log in logs {
        for entry in &log.entries {
            if entry.phase == "sprint" {
                let label = choice_label(&entry.choice);
                *action_counts.entry(label).or_insert(0) += 1;
            }
        }
    }
    let mut sprint_action_frequency: Vec<_> = action_counts.into_iter().collect();
    sprint_action_frequency.sort_by(|a, b| b.1.cmp(&a.1));

    // Commitment stats
    let mut main_count = 0usize;
    let mut pro_count = 0usize;
    let mut main_wins = 0usize;
    let mut pro_wins = 0usize;
    let mut main_total = 0usize;
    let mut pro_total = 0usize;
    for log in logs {
        // Track commitment choices per player
        let mut player_commitment: HashMap<usize, Commitment> = HashMap::new();
        for entry in &log.entries {
            if entry.phase == "commitment" {
                if let Choice::CommitLine { line } = &entry.choice {
                    // Only count first commitment per game per player
                    player_commitment.entry(entry.player_index).or_insert(*line);
                    match line {
                        Commitment::Main => main_count += 1,
                        Commitment::Pro => pro_count += 1,
                    }
                }
            }
        }
        // Correlate with outcomes
        for (pi, commitment) in &player_commitment {
            if let Some(standing) = log.final_standings.get(*pi) {
                let is_winner = standing.reward > 0.99;
                match commitment {
                    Commitment::Main => {
                        main_total += 1;
                        if is_winner { main_wins += 1; }
                    }
                    Commitment::Pro => {
                        pro_total += 1;
                        if is_winner { pro_wins += 1; }
                    }
                }
            }
        }
    }
    let commitment_stats = CommitmentStats {
        main_count,
        pro_count,
        main_win_rate: if main_total > 0 { main_wins as f64 / main_total as f64 } else { 0.0 },
        pro_win_rate: if pro_total > 0 { pro_wins as f64 / pro_total as f64 } else { 0.0 },
    };

    // Upgrade frequency
    let mut upgrade_counts: HashMap<String, usize> = HashMap::new();
    for log in logs {
        for entry in &log.entries {
            if entry.phase == "stage_break" {
                if let Choice::BuyUpgrade { upgrade } = &entry.choice {
                    let label = upgrade.name().to_string();
                    *upgrade_counts.entry(label).or_insert(0) += 1;
                }
            }
        }
    }
    let mut upgrade_frequency: Vec<_> = upgrade_counts.into_iter().collect();
    upgrade_frequency.sort_by(|a, b| b.1.cmp(&a.1));

    // Winners vs losers
    let winners_vs_losers = compute_winners_vs_losers(logs);

    AnalysisResults {
        game_count,
        avg_duration_ms,
        avg_rounds,
        avg_obstacles_cleared,
        avg_progress,
        avg_penalties,
        win_rate_by_position,
        obstacles_cleared_distribution,
        progress_distribution,
        penalty_distribution,
        sprint_action_frequency,
        commitment_stats,
        upgrade_frequency,
        winners_vs_losers,
    }
}

fn compute_winners_vs_losers(logs: &[&GameRunOutput]) -> WinnersVsLosers {
    let mut w_obs = Vec::new();
    let mut l_obs = Vec::new();
    let mut w_prog = Vec::new();
    let mut l_prog = Vec::new();
    let mut w_pen = Vec::new();
    let mut l_pen = Vec::new();
    let mut w_flow = Vec::new();
    let mut l_flow = Vec::new();
    let mut w_mom = Vec::new();
    let mut l_mom = Vec::new();

    for log in logs {
        for s in &log.final_standings {
            if s.reward > 0.99 {
                w_obs.push(s.obstacles_cleared as f64);
                w_prog.push(s.progress as f64);
                w_pen.push(s.penalties as f64);
                w_flow.push(s.flow as f64);
                w_mom.push(s.momentum as f64);
            } else {
                l_obs.push(s.obstacles_cleared as f64);
                l_prog.push(s.progress as f64);
                l_pen.push(s.penalties as f64);
                l_flow.push(s.flow as f64);
                l_mom.push(s.momentum as f64);
            }
        }
    }

    WinnersVsLosers {
        winner_avg_obstacles: avg(&w_obs),
        loser_avg_obstacles: avg(&l_obs),
        winner_avg_progress: avg(&w_prog),
        loser_avg_progress: avg(&l_prog),
        winner_avg_penalties: avg(&w_pen),
        loser_avg_penalties: avg(&l_pen),
        winner_avg_flow: avg(&w_flow),
        loser_avg_flow: avg(&l_flow),
        winner_avg_momentum: avg(&w_mom),
        loser_avg_momentum: avg(&l_mom),
    }
}

fn avg(vals: &[f64]) -> f64 {
    if vals.is_empty() { 0.0 } else { vals.iter().sum::<f64>() / vals.len() as f64 }
}

fn build_distribution(values: impl Iterator<Item = i32>) -> Vec<(i32, usize)> {
    let mut counts: HashMap<i32, usize> = HashMap::new();
    for v in values {
        *counts.entry(v).or_insert(0) += 1;
    }
    let mut dist: Vec<_> = counts.into_iter().collect();
    dist.sort_by_key(|&(v, _)| v);
    dist
}

fn choice_label(choice: &Choice) -> String {
    match choice {
        Choice::Pedal => "Pedal".into(),
        Choice::Brake => "Brake".into(),
        Choice::Steer { .. } => "Steer".into(),
        Choice::Technique { .. } => "Technique".into(),
        Choice::DrawObstacle => "Draw Obstacle".into(),
        Choice::ReuseObstacle { .. } => "Reuse Obstacle".into(),
        Choice::ResolveObstacle => "Resolve Obstacle".into(),
        Choice::SendIt => "Send It".into(),
        Choice::FlowSpend { .. } => "Flow Spend".into(),
        Choice::CommitLine { .. } => "Commit Line".into(),
        Choice::EndTurn => "End Turn".into(),
        Choice::BuyUpgrade { .. } => "Buy Upgrade".into(),
    }
}

fn empty_results() -> AnalysisResults {
    AnalysisResults {
        game_count: 0,
        avg_duration_ms: 0.0,
        avg_rounds: 0.0,
        avg_obstacles_cleared: 0.0,
        avg_progress: 0.0,
        avg_penalties: 0.0,
        win_rate_by_position: Vec::new(),
        obstacles_cleared_distribution: Vec::new(),
        progress_distribution: Vec::new(),
        penalty_distribution: Vec::new(),
        sprint_action_frequency: Vec::new(),
        commitment_stats: CommitmentStats {
            main_count: 0,
            pro_count: 0,
            main_win_rate: 0.0,
            pro_win_rate: 0.0,
        },
        upgrade_frequency: Vec::new(),
        winners_vs_losers: WinnersVsLosers {
            winner_avg_obstacles: 0.0,
            loser_avg_obstacles: 0.0,
            winner_avg_progress: 0.0,
            loser_avg_progress: 0.0,
            winner_avg_penalties: 0.0,
            loser_avg_penalties: 0.0,
            winner_avg_flow: 0.0,
            loser_avg_flow: 0.0,
            winner_avg_momentum: 0.0,
            loser_avg_momentum: 0.0,
        },
    }
}
