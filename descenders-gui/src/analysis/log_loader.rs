use std::path::{Path, PathBuf};
use std::sync::mpsc;

use descenders_core::types::GameRunOutput;
use regex::Regex;

pub struct TaggedGameLog {
    pub log: GameRunOutput,
    pub batch_id: String,
}

pub enum LoadResult {
    Idle,
    Loading,
    Done(Vec<TaggedGameLog>),
    Error(String),
}

pub struct LogLoader {
    receiver: Option<mpsc::Receiver<Result<Vec<TaggedGameLog>, String>>>,
    loading: bool,
}

impl LogLoader {
    pub fn new() -> Self {
        Self {
            receiver: None,
            loading: false,
        }
    }

    pub fn is_loading(&self) -> bool {
        self.loading
    }

    pub fn start_loading(&mut self, path: &Path) {
        let path = path.to_path_buf();
        let (tx, rx) = mpsc::channel();
        self.receiver = Some(rx);
        self.loading = true;

        std::thread::spawn(move || {
            let result = load_logs_from_dir(&path);
            let _ = tx.send(result);
        });
    }

    pub fn poll(&mut self) -> LoadResult {
        if let Some(ref rx) = self.receiver {
            match rx.try_recv() {
                Ok(Ok(logs)) => {
                    self.loading = false;
                    self.receiver = None;
                    LoadResult::Done(logs)
                }
                Ok(Err(e)) => {
                    self.loading = false;
                    self.receiver = None;
                    LoadResult::Error(e)
                }
                Err(mpsc::TryRecvError::Empty) => LoadResult::Loading,
                Err(mpsc::TryRecvError::Disconnected) => {
                    self.loading = false;
                    self.receiver = None;
                    LoadResult::Error("Loader thread disconnected".into())
                }
            }
        } else {
            LoadResult::Idle
        }
    }
}

fn load_logs_from_dir(path: &PathBuf) -> Result<Vec<TaggedGameLog>, String> {
    let batch_re = Regex::new(r"game-\d+-([a-z0-9]{6})-[a-z0-9]{4}\.json")
        .map_err(|e| format!("Regex error: {}", e))?;

    let entries = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut logs = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_name.ends_with(".json") {
            continue;
        }

        let batch_id = batch_re
            .captures(&file_name)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let contents = match std::fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let log: GameRunOutput = match serde_json::from_str(&contents) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("Failed to parse {}: {}", file_name, e);
                continue;
            }
        };

        logs.push(TaggedGameLog { log, batch_id });
    }

    logs.sort_by(|a, b| a.log.game_started_at.cmp(&b.log.game_started_at));
    Ok(logs)
}
