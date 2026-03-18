use std::path::{Path, PathBuf};

use eframe::egui;
use treadline_core::types::GameRunOutput;

pub struct GameViewerState {
    loaded_game: Option<GameRunOutput>,
    error: Option<String>,
    available_files: Vec<(String, PathBuf)>,
    selected_file_index: Option<usize>,
    manual_path: String,
    game_logs_dir: Option<PathBuf>,
}

impl GameViewerState {
    pub fn new() -> Self {
        Self {
            loaded_game: None,
            error: None,
            available_files: Vec::new(),
            selected_file_index: None,
            manual_path: String::new(),
            game_logs_dir: None,
        }
    }

    pub fn set_game_logs_dir(&mut self, path: &Path) {
        self.game_logs_dir = Some(path.to_path_buf());
        self.refresh_file_list();
    }

    fn refresh_file_list(&mut self) {
        self.available_files.clear();
        self.selected_file_index = None;

        let dir = match &self.game_logs_dir {
            Some(d) => d.clone(),
            None => return,
        };

        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.ends_with(".json") {
                    self.available_files.push((file_name, entry.path()));
                }
            }
        }

        // Sort reverse so newest files (with timestamp in name) appear first
        self.available_files.sort_by(|a, b| b.0.cmp(&a.0));
    }

    fn load_file(&mut self, path: &Path) {
        match std::fs::read_to_string(path) {
            Ok(contents) => match serde_json::from_str::<GameRunOutput>(&contents) {
                Ok(log) => {
                    self.loaded_game = Some(log);
                    self.error = None;
                }
                Err(e) => {
                    self.error = Some(format!("Parse error: {}", e));
                    self.loaded_game = None;
                }
            },
            Err(e) => {
                self.error = Some(format!("Read error: {}", e));
                self.loaded_game = None;
            }
        }
    }

    pub fn render(&mut self, ui: &mut egui::Ui) {
        ui.add_space(8.0);

        // File selection from game-logs directory
        if !self.available_files.is_empty() {
            ui.horizontal(|ui| {
                ui.label("Game log:");
                let selected_text = match self.selected_file_index {
                    Some(i) => self.available_files[i].0.clone(),
                    None => "Select a game log...".to_string(),
                };
                let combo = egui::ComboBox::from_id_salt("game_log_picker")
                    .selected_text(selected_text)
                    .width(400.0)
                    .show_ui(ui, |ui| {
                        let mut changed = false;
                        for (i, (name, _)) in self.available_files.iter().enumerate() {
                            if ui
                                .selectable_label(self.selected_file_index == Some(i), name)
                                .clicked()
                            {
                                self.selected_file_index = Some(i);
                                changed = true;
                            }
                        }
                        changed
                    });

                if combo.inner == Some(true) {
                    if let Some(i) = self.selected_file_index {
                        let path = self.available_files[i].1.clone();
                        self.load_file(&path);
                    }
                }

                if ui.button("Refresh").clicked() {
                    self.refresh_file_list();
                }
            });
        } else if self.game_logs_dir.is_some() {
            ui.label("No game logs found in game-logs/ directory.");
        }

        // Manual path input
        egui::CollapsingHeader::new("Load from path...")
            .default_open(self.available_files.is_empty())
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.text_edit_singleline(&mut self.manual_path);
                    if ui.button("Load").clicked() && !self.manual_path.is_empty() {
                        let path = PathBuf::from(&self.manual_path);
                        self.load_file(&path);
                    }
                });
            });

        if let Some(ref err) = self.error {
            ui.colored_label(egui::Color32::RED, err);
        }

        if let Some(ref game) = self.loaded_game {
            ui.add_space(8.0);
            ui.separator();

            // Metadata
            ui.heading("Game Details");
            egui::Grid::new("game_metadata")
                .num_columns(2)
                .spacing([12.0, 4.0])
                .show(ui, |ui| {
                    ui.label("Players:");
                    ui.label(game.player_names.join(", "));
                    ui.end_row();

                    ui.label("Trail:");
                    ui.label(&game.trail_id);
                    ui.end_row();

                    ui.label("Iterations:");
                    ui.label(format!("{}", game.iterations));
                    ui.end_row();

                    ui.label("Duration:");
                    ui.label(format!("{:.1}s", game.duration_ms as f64 / 1000.0));
                    ui.end_row();

                    ui.label("Entries:");
                    ui.label(format!("{}", game.entries.len()));
                    ui.end_row();
                });

            ui.add_space(8.0);
            ui.separator();

            // Final standings
            ui.heading("Final Standings");
            egui::Grid::new("final_standings")
                .num_columns(8)
                .spacing([12.0, 4.0])
                .striped(true)
                .show(ui, |ui| {
                    ui.label(egui::RichText::new("Player").strong());
                    ui.label(egui::RichText::new("Cleared").strong());
                    ui.label(egui::RichText::new("Progress").strong());
                    ui.label(egui::RichText::new("Perfect").strong());
                    ui.label(egui::RichText::new("Penalties").strong());
                    ui.label(egui::RichText::new("Flow").strong());
                    ui.label(egui::RichText::new("Momentum").strong());
                    ui.label(egui::RichText::new("Reward").strong());
                    ui.end_row();

                    for s in &game.final_standings {
                        let color = if s.reward > 0.99 {
                            egui::Color32::from_rgb(100, 200, 100)
                        } else {
                            egui::Color32::WHITE
                        };
                        ui.label(egui::RichText::new(&s.name).color(color));
                        ui.label(format!("{}", s.obstacles_cleared));
                        ui.label(format!("{}", s.progress));
                        ui.label(format!("{}", s.perfect_matches));
                        ui.label(format!("{}", s.penalties));
                        ui.label(format!("{}", s.flow));
                        ui.label(format!("{}", s.momentum));
                        ui.label(format!("{:.2}", s.reward));
                        ui.end_row();
                    }
                });

            ui.add_space(8.0);
            ui.separator();

            // Entries grouped by round
            ui.heading("Game Log");
            egui::ScrollArea::vertical()
                .max_height(400.0)
                .show(ui, |ui| {
                    let mut current_round = 0u32;
                    for entry in &game.entries {
                        if entry.round != current_round {
                            current_round = entry.round;
                            ui.add_space(4.0);
                            ui.label(
                                egui::RichText::new(format!("--- Round {} ---", current_round))
                                    .strong()
                                    .color(egui::Color32::from_rgb(74, 158, 255)),
                            );
                        }

                        let player_name = game
                            .player_names
                            .get(entry.player_index)
                            .map(|s| s.as_str())
                            .unwrap_or("?");

                        ui.label(format!(
                            "  #{} [{}] {}: {:?}",
                            entry.seq, entry.phase, player_name, entry.choice
                        ));
                    }
                });
        }
    }
}
