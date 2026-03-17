use eframe::egui;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use crate::analysis::computations::{compute_analysis, AnalysisResults};
use crate::analysis::log_loader::{LoadResult, LogLoader, TaggedGameLog};
use crate::tabs::analysis::render_analysis_tab;
use crate::tabs::game_viewer::GameViewerState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Tab {
    Analysis,
    GameViewer,
}

struct BatchInfo {
    count: usize,
    iterations: u32,
}

pub struct DescendersGuiApp {
    active_tab: Tab,
    loader: LogLoader,
    game_logs_path: Option<PathBuf>,
    tagged_logs: Vec<TaggedGameLog>,
    load_error: Option<String>,

    selected_batch: String,
    cached_analysis: Option<AnalysisResults>,
    cache_key: String,

    game_viewer: GameViewerState,
}

impl DescendersGuiApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let mut visuals = egui::Visuals::dark();
        visuals.override_text_color = Some(egui::Color32::WHITE);
        cc.egui_ctx.set_visuals(visuals);

        let mut app = Self {
            active_tab: Tab::Analysis,
            loader: LogLoader::new(),
            game_logs_path: None,
            tagged_logs: Vec::new(),
            load_error: None,
            selected_batch: "all".to_string(),
            cached_analysis: None,
            cache_key: String::new(),
            game_viewer: GameViewerState::new(),
        };

        if let Ok(cwd) = std::env::current_dir() {
            let game_logs_path = cwd.join("game-logs");
            if game_logs_path.is_dir() {
                app.loader.start_loading(&game_logs_path);
                app.game_logs_path = Some(game_logs_path);
            }
        }

        app
    }

    fn filtered_logs(&self) -> Vec<&descenders_core::types::GameRunOutput> {
        if self.selected_batch == "all" {
            self.tagged_logs.iter().map(|t| &t.log).collect()
        } else {
            self.tagged_logs
                .iter()
                .filter(|t| t.batch_id == self.selected_batch)
                .map(|t| &t.log)
                .collect()
        }
    }

    fn available_batches(&self) -> Vec<String> {
        let mut batches: Vec<String> = self
            .tagged_logs
            .iter()
            .map(|t| t.batch_id.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        batches.sort();
        batches.reverse(); // newest first (alphabetical of batch IDs isn't ideal, but works)
        batches
    }

    fn compute_batch_info(&self) -> HashMap<String, BatchInfo> {
        let mut map: HashMap<String, BatchInfo> = HashMap::new();
        for t in &self.tagged_logs {
            if let Some(existing) = map.get_mut(&t.batch_id) {
                existing.count += 1;
            } else {
                map.insert(
                    t.batch_id.clone(),
                    BatchInfo {
                        count: 1,
                        iterations: t.log.iterations,
                    },
                );
            }
        }
        map
    }

    fn ensure_analysis_cached(&mut self) {
        let key = format!("{}:{}", self.selected_batch, self.tagged_logs.len());
        if self.cache_key != key {
            let filtered = self.filtered_logs();
            self.cached_analysis = Some(compute_analysis(&filtered));
            self.cache_key = key;
        }
    }
}

impl eframe::App for DescendersGuiApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Poll loader
        match self.loader.poll() {
            LoadResult::Done(logs) => {
                self.tagged_logs = logs;
                self.load_error = None;
                self.cache_key.clear();
                let batches = self.available_batches();
                self.selected_batch = batches.into_iter().next().unwrap_or_else(|| "all".to_string());
            }
            LoadResult::Error(e) => {
                self.load_error = Some(e);
                self.tagged_logs.clear();
                self.cache_key.clear();
            }
            LoadResult::Loading => {
                ctx.request_repaint();
            }
            LoadResult::Idle => {}
        }

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("Descenders Game Analysis");
            ui.add_space(4.0);

            // Tab bar
            ui.horizontal(|ui| {
                for (tab, label) in [
                    (Tab::Analysis, "Game Analysis"),
                    (Tab::GameViewer, "Game Viewer"),
                ] {
                    let is_active = self.active_tab == tab;
                    let response = ui.selectable_value(&mut self.active_tab, tab, label);
                    if is_active {
                        let rect = response.rect;
                        ui.painter().rect_filled(
                            egui::Rect::from_min_size(
                                egui::pos2(rect.min.x, rect.max.y - 2.0),
                                egui::vec2(rect.width(), 2.0),
                            ),
                            0.0,
                            egui::Color32::from_rgb(74, 158, 255),
                        );
                    }
                }
            });
            ui.separator();

            match self.active_tab {
                Tab::Analysis => {
                    // Controls
                    ui.horizontal(|ui| {
                        if let Some(ref path) = self.game_logs_path {
                            if ui.button("Refresh").clicked() && !self.loader.is_loading() {
                                self.loader.start_loading(path);
                            }
                        }
                        if self.loader.is_loading() {
                            ui.spinner();
                            ui.label("Loading...");
                        }
                    });

                    if let Some(ref error) = self.load_error {
                        ui.colored_label(egui::Color32::RED, error);
                    }

                    if self.tagged_logs.is_empty() {
                        ui.add_space(20.0);
                        ui.label("No game logs found. Run descenders-runner to generate logs in game-logs/");
                        return;
                    }

                    // Batch filter
                    let batches = self.available_batches();
                    if batches.len() > 1 {
                        let batch_info = self.compute_batch_info();
                        ui.horizontal(|ui| {
                            ui.label("Batch:");
                            let selected_text = if self.selected_batch == "all" {
                                format!("All batches ({} games)", self.tagged_logs.len())
                            } else {
                                let info = batch_info.get(&self.selected_batch);
                                let count = info.map(|i| i.count).unwrap_or(0);
                                let iters = info.map(|i| i.iterations).unwrap_or(0);
                                format!("{} ({} games, {} iters)", self.selected_batch, count, iters)
                            };
                            egui::ComboBox::from_id_salt("batch_filter")
                                .selected_text(selected_text)
                                .show_ui(ui, |ui| {
                                    ui.selectable_value(
                                        &mut self.selected_batch,
                                        "all".to_string(),
                                        format!("All batches ({} games)", self.tagged_logs.len()),
                                    );
                                    for batch in &batches {
                                        let info = batch_info.get(batch);
                                        let count = info.map(|i| i.count).unwrap_or(0);
                                        let iters = info.map(|i| i.iterations).unwrap_or(0);
                                        let label = format!("{} ({} games, {} iters)", batch, count, iters);
                                        ui.selectable_value(
                                            &mut self.selected_batch,
                                            batch.clone(),
                                            label,
                                        );
                                    }
                                });
                        });
                    }

                    let filtered_count = self.filtered_logs().len();
                    ui.label(format!("{} games shown", filtered_count));

                    // Render analysis
                    self.ensure_analysis_cached();
                    if let Some(ref analysis) = self.cached_analysis {
                        render_analysis_tab(ui, analysis);
                    }
                }

                Tab::GameViewer => {
                    self.game_viewer.render(ui);
                }
            }
        });
    }
}
