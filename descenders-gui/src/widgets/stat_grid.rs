use eframe::egui;

pub struct StatCard {
    pub label: String,
    pub value: String,
}

pub fn render_stat_grid(ui: &mut egui::Ui, cards: &[StatCard]) {
    let accent = egui::Color32::from_rgb(74, 158, 255);

    ui.horizontal_wrapped(|ui| {
        for card in cards {
            let frame = egui::Frame::default()
                .inner_margin(egui::Margin::same(12))
                .stroke(egui::Stroke::new(1.0, accent))
                .corner_radius(egui::CornerRadius::same(4));

            frame.show(ui, |ui| {
                ui.set_min_width(120.0);
                ui.vertical(|ui| {
                    ui.label(
                        egui::RichText::new(&card.value)
                            .size(24.0)
                            .strong()
                            .color(egui::Color32::WHITE),
                    );
                    ui.label(
                        egui::RichText::new(&card.label)
                            .size(11.0)
                            .color(egui::Color32::GRAY),
                    );
                });
            });
        }
    });
}
