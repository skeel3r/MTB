use eframe::egui;
use descenders_core::types::GameRunOutput;

pub struct GameViewerState {
    loaded_game: Option<GameRunOutput>,
    error: Option<String>,
}

impl GameViewerState {
    pub fn new() -> Self {
        Self {
            loaded_game: None,
            error: None,
        }
    }

    pub fn render(&mut self, ui: &mut egui::Ui) {
        ui.add_space(8.0);

        if ui.button("Load Game Log...").clicked() {
            if let Some(path) = rfd::FileDialog::new()
                .add_filter("JSON", &["json"])
                .pick_file()
            {
                match std::fs::read_to_string(&path) {
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
        }

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
