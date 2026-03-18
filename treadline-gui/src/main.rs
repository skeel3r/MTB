mod analysis;
mod app;
mod tabs;
mod widgets;

fn main() -> eframe::Result {
    let options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([1200.0, 800.0]),
        ..Default::default()
    };
    eframe::run_native(
        "Descenders Game Analysis",
        options,
        Box::new(|cc| Ok(Box::new(app::DescendersGuiApp::new(cc)))),
    )
}
