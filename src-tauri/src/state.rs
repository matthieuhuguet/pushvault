use std::sync::Arc;
use tokio::sync::RwLock;
use crate::models::AppConfig;

pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
        }
    }
}
