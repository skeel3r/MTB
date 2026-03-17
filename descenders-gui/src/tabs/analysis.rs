use eframe::egui;
use egui_plot::{Bar, BarChart, Plot};

use crate::analysis::computations::AnalysisResults;
use crate::widgets::bar_table::{render_bar_table, BarRow};
use crate::widgets::stat_grid::{render_stat_grid, StatCard};

pub fn render_analysis_tab(ui: &mut egui::Ui, analysis: &AnalysisResults) {
    egui::ScrollArea::vertical().show(ui, |ui| {
        // ── Game Overview ──
        ui.add_space(8.0);
        egui::CollapsingHeader::new(
            egui::RichText::new("Game Overview").size(16.0).strong(),
        )
        .default_open(true)
        .show(ui, |ui| {
            render_stat_grid(
                ui,
                &[
                    StatCard {
                        label: "Games Analyzed".into(),
                        value: format!("{}", analysis.game_count),
                    },
                    StatCard {
                        label: "Avg Duration".into(),
                        value: format!("{:.1}s", analysis.avg_duration_ms / 1000.0),
                    },
                    StatCard {
                        label: "Avg Rounds".into(),
                        value: format!("{:.1}", analysis.avg_rounds),
                    },
                    StatCard {
                        label: "Avg Obstacles Cleared".into(),
                        value: format!("{:.1}", analysis.avg_obstacles_cleared),
                    },
                    StatCard {
                        label: "Avg Progress".into(),
                        value: format!("{:.1}", analysis.avg_progress),
                    },
                    StatCard {
                        label: "Avg Penalties".into(),
                        value: format!("{:.1}", analysis.avg_penalties),
                    },
                ],
            );
        });

        ui.add_space(8.0);
        ui.separator();

        // ── Win Rate by Position ──
        egui::CollapsingHeader::new(
            egui::RichText::new("Win Rate by Position").size(16.0).strong(),
        )
        .default_open(true)
        .show(ui, |ui| {
            let rows: Vec<BarRow> = analysis
                .win_rate_by_position
                .iter()
                .map(|(label, rate, count)| BarRow {
                    label: format!("{} (n={})", label, count),
                    value: *rate,
                    display: format!("{:.1}%", rate * 100.0),
                    max_value: 1.0,
                })
                .collect();
            render_bar_table(ui, &rows);
        });

        ui.add_space(8.0);
        ui.separator();

        // ── Distributions ──
        egui::CollapsingHeader::new(
            egui::RichText::new("Final Standings Distributions")
                .size(16.0)
                .strong(),
        )
        .default_open(true)
        .show(ui, |ui| {
            ui.columns(3, |cols| {
                render_histogram(&mut cols[0], "Obstacles Cleared", &analysis.obstacles_cleared_distribution);
                render_histogram(&mut cols[1], "Progress", &analysis.progress_distribution);
                render_histogram(&mut cols[2], "Penalties", &analysis.penalty_distribution);
            });
        });

        ui.add_space(8.0);
        ui.separator();

        // ── Sprint Action Frequency ──
        egui::CollapsingHeader::new(
            egui::RichText::new("Sprint Action Frequency")
                .size(16.0)
                .strong(),
        )
        .default_open(true)
        .show(ui, |ui| {
            let max_count = analysis
                .sprint_action_frequency
                .first()
                .map(|(_, c)| *c)
                .unwrap_or(1);
            let rows: Vec<BarRow> = analysis
                .sprint_action_frequency
                .iter()
                .map(|(label, count)| BarRow {
                    label: label.clone(),
                    value: *count as f64,
                    display: format!("{}", count),
                    max_value: max_count as f64,
                })
                .collect();
            render_bar_table(ui, &rows);
        });

        ui.add_space(8.0);
        ui.separator();

        // ── Commitment Analysis ──
        egui::CollapsingHeader::new(
            egui::RichText::new("Commitment Analysis")
                .size(16.0)
                .strong(),
        )
        .default_open(true)
        .show(ui, |ui| {
            let stats = &analysis.commitment_stats;
            let total = (stats.main_count + stats.pro_count).max(1);
            render_stat_grid(
                ui,
                &[
                    StatCard {
                        label: "Main Line Chosen".into(),
                        value: format!(
                            "{} ({:.0}%)",
                            stats.main_count,
                            stats.main_count as f64 / total as f64 * 100.0
                        ),
                    },
                    StatCard {
                        label: "Pro Line Chosen".into(),
                        value: format!(
                            "{} ({:.0}%)",
                            stats.pro_count,
                            stats.pro_count as f64 / total as f64 * 100.0
                        ),
                    },
                    StatCard {
                        label: "Main Win Rate".into(),
                        value: format!("{:.1}%", stats.main_win_rate * 100.0),
                    },
                    StatCard {
                        label: "Pro Win Rate".into(),
                        value: format!("{:.1}%", stats.pro_win_rate * 100.0),
                    },
                ],
            );
        });

        ui.add_space(8.0);
        ui.separator();

        // ── Upgrade Analysis ──
        egui::CollapsingHeader::new(
            egui::RichText::new("Upgrade Purchases").size(16.0).strong(),
        )
        .default_open(true)
        .show(ui, |ui| {
            if analysis.upgrade_frequency.is_empty() {
                ui.label("No upgrades purchased");
            } else {
                let max_count = analysis
                    .upgrade_frequency
                    .first()
                    .map(|(_, c)| *c)
                    .unwrap_or(1);
                let rows: Vec<BarRow> = analysis
                    .upgrade_frequency
                    .iter()
                    .map(|(label, count)| BarRow {
                        label: label.clone(),
                        value: *count as f64,
                        display: format!("{}", count),
                        max_value: max_count as f64,
                    })
                    .collect();
                render_bar_table(ui, &rows);
            }
        });

        ui.add_space(8.0);
        ui.separator();

        // ── Winners vs Losers ──
        egui::CollapsingHeader::new(
            egui::RichText::new("Winners vs Losers").size(16.0).strong(),
        )
        .default_open(true)
        .show(ui, |ui| {
            let wvl = &analysis.winners_vs_losers;
            egui::Grid::new("winners_vs_losers")
                .num_columns(3)
                .spacing([16.0, 6.0])
                .min_col_width(100.0)
                .show(ui, |ui| {
                    ui.label(egui::RichText::new("Metric").strong());
                    ui.label(egui::RichText::new("Winners").strong().color(egui::Color32::from_rgb(100, 200, 100)));
                    ui.label(egui::RichText::new("Losers").strong().color(egui::Color32::from_rgb(200, 100, 100)));
                    ui.end_row();

                    comparison_row(ui, "Obstacles Cleared", wvl.winner_avg_obstacles, wvl.loser_avg_obstacles);
                    comparison_row(ui, "Progress", wvl.winner_avg_progress, wvl.loser_avg_progress);
                    comparison_row(ui, "Penalties", wvl.winner_avg_penalties, wvl.loser_avg_penalties);
                    comparison_row(ui, "Flow", wvl.winner_avg_flow, wvl.loser_avg_flow);
                    comparison_row(ui, "Momentum", wvl.winner_avg_momentum, wvl.loser_avg_momentum);
                });
        });
    });
}

fn comparison_row(ui: &mut egui::Ui, label: &str, winner: f64, loser: f64) {
    ui.label(label);
    ui.label(format!("{:.1}", winner));
    ui.label(format!("{:.1}", loser));
    ui.end_row();
}

fn render_histogram(ui: &mut egui::Ui, title: &str, data: &[(i32, usize)]) {
    ui.label(egui::RichText::new(title).strong());
    if data.is_empty() {
        ui.label("No data");
        return;
    }

    let bars: Vec<Bar> = data
        .iter()
        .map(|&(value, count)| Bar::new(value as f64, count as f64).width(0.8))
        .collect();

    let chart = BarChart::new(title, bars).color(egui::Color32::from_rgb(74, 158, 255));

    Plot::new(ui.id().with(title))
        .height(160.0)
        .allow_drag(false)
        .allow_zoom(false)
        .allow_scroll(false)
        .show(ui, |plot_ui| {
            plot_ui.bar_chart(chart);
        });
}
