use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;
use crate::models::AppConfig;

/// Holds filesystem watchers so they stay alive for the duration of the app.
pub struct WatcherState {
    pub watchers: Vec<notify::RecommendedWatcher>,
}

// SAFETY: RecommendedWatcher is Send on all platforms notify supports.
unsafe impl Send for WatcherState {}
unsafe impl Sync for WatcherState {}

pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
    pub watcher_state: Mutex<WatcherState>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            watcher_state: Mutex::new(WatcherState { watchers: Vec::new() }),
        }
    }
}
