use tauri::State;

use crate::{
    config,
    models::{AppConfig, RepoConfig},
    state::AppState,
};

#[tauri::command]
pub async fn load_config_cmd(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let cfg = state.config.read().await;
    Ok(cfg.clone())
}

#[tauri::command]
pub async fn save_config_cmd(
    config: AppConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut cfg = state.config.write().await;
        *cfg = config.clone();
    }
    config::save_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_repo(
    repo: RepoConfig,
    state: State<'_, AppState>,
) -> Result<AppConfig, String> {
    let updated = {
        let mut cfg = state.config.write().await;
        // Avoid duplicates by path
        if !cfg.repos.iter().any(|r| r.path == repo.path) {
            cfg.repos.push(repo);
        }
        cfg.clone()
    };
    config::save_config(&updated).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
pub async fn remove_repo(
    path: String,
    state: State<'_, AppState>,
) -> Result<AppConfig, String> {
    let updated = {
        let mut cfg = state.config.write().await;
        cfg.repos.retain(|r| r.path != path);
        cfg.clone()
    };
    config::save_config(&updated).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
pub async fn update_repo(
    repo: RepoConfig,
    state: State<'_, AppState>,
) -> Result<AppConfig, String> {
    let updated = {
        let mut cfg = state.config.write().await;
        if let Some(existing) = cfg.repos.iter_mut().find(|r| r.path == repo.path) {
            *existing = repo;
        } else {
            cfg.repos.push(repo);
        }
        cfg.clone()
    };
    config::save_config(&updated).map_err(|e| e.to_string())?;
    Ok(updated)
}
