use eframe::egui;

pub struct BarRow {
    pub label: String,
    pub value: f64,     // 0.0 to 1.0 for rates, or raw value
    pub display: String, // formatted display text
    pub max_value: f64,  // for scaling the bar width
}

/// Render a table of horizontal bars with labels and values.
pub fn render_bar_table(ui: &mut egui::Ui, rows: &[BarRow]) {
    if rows.is_empty() {
        return;
    }

    egui::Grid::new(ui.id().with("bar_table"))
        .num_columns(3)
        .min_col_width(80.0)
        .spacing([8.0, 4.0])
        .show(ui, |ui| {
            for row in rows {
                // Label
                ui.label(&row.label);

                // Bar
                let bar_width = 200.0;
                let fill_frac = if row.max_value > 0.0 {
                    (row.value / row.max_value).min(1.0)
                } else {
                    0.0
                };
                let (rect, _) =
                    ui.allocate_exact_size(egui::vec2(bar_width, 16.0), egui::Sense::hover());

                // Background
                ui.painter().rect_filled(
                    rect,
                    egui::CornerRadius::same(2),
                    egui::Color32::from_gray(40),
                );

                // Fill
                if fill_frac > 0.0 {
                    let fill_rect = egui::Rect::from_min_size(
                        rect.min,
                        egui::vec2(rect.width() * fill_frac as f32, rect.height()),
                    );
                    let color = rate_color(fill_frac);
                    ui.painter()
                        .rect_filled(fill_rect, egui::CornerRadius::same(2), color);
                }

                // Value text
                ui.label(
                    egui::RichText::new(&row.display)
                        .size(12.0)
                        .color(egui::Color32::WHITE),
                );

                ui.end_row();
            }
        });
}

/// Color interpolation: red (0%) -> yellow (50%) -> green (100%)
fn rate_color(rate: f64) -> egui::Color32 {
    let r = rate.clamp(0.0, 1.0) as f32;
    if r < 0.5 {
        let t = r / 0.5;
        egui::Color32::from_rgb(
            200,
            (200.0 * t) as u8,
            30,
        )
    } else {
        let t = (r - 0.5) / 0.5;
        egui::Color32::from_rgb(
            (200.0 * (1.0 - t)) as u8,
            200,
            30,
        )
    }
}
