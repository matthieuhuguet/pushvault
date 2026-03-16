use std::path::{Path, PathBuf};
use crate::{error::PvError, models::{AppConfig, RepoConfig}};

/// Returns true when a `pushvault.portable` marker file sits next to the exe.
/// In portable mode the config is stored alongside the executable instead of
/// in the OS application-data directory.
pub fn is_portable() -> bool {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.join("pushvault.portable").exists();
        }
    }
    false
}

fn config_path() -> PathBuf {
    if is_portable() {
        // Portable: config.json lives next to the exe
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                return dir.join("config.json");
            }
        }
    }
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("pushvault")
        .join("config.json")
}

// Try to find and load the legacy Python config.json from common locations
fn find_legacy_config() -> Option<PathBuf> {
    let candidates = [
        // Common development paths
        PathBuf::from(r"E:\Create\Build\PortfolioShare\2026-03\2026-03-12_PushVault2\config.json"),
        // Relative path (if running from project dir)
        PathBuf::from("config.json"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn migrate_legacy_config(legacy_path: &Path) -> Option<AppConfig> {
    let content = std::fs::read_to_string(legacy_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;

    let repos: Vec<RepoConfig> = v["repos"].as_array()?.iter().filter_map(|r| {
        Some(RepoConfig {
            name: r["name"].as_str()?.to_string(),
            path: r["path"].as_str()?.to_string(),
            remote: r["remote"].as_str().unwrap_or("").to_string(),
            icon: r["icon"].as_str().unwrap_or("folder").to_string(),
            color: r["color"].as_str().unwrap_or("#1DB954").to_string(),
        })
    }).collect();

    let window_width = v["window"]["width"].as_u64().unwrap_or(1200) as u32;
    let window_height = v["window"]["height"].as_u64().unwrap_or(750) as u32;
    // Cap to reasonable screen size
    let window_width = window_width.min(2560);
    let window_height = window_height.min(1440);

    Some(AppConfig {
        repos,
        auto_check_interval_minutes: v["auto_check_interval_minutes"].as_u64().unwrap_or(5),
        max_file_size_mb: v["max_file_size_mb"].as_u64().unwrap_or(49),
        batch_size: v["batch_size"].as_u64().unwrap_or(50) as usize,
        window_width,
        window_height,
        gpg_sign_commits: v["gpg_sign_commits"].as_bool().unwrap_or(false),
        gpg_key_id: v["gpg_key_id"].as_str().unwrap_or("").to_string(),
        github_token: v["github_token"].as_str().unwrap_or("").to_string(),
    })
}

pub fn load_config() -> AppConfig {
    let primary = config_path();

    // Try primary config first
    if primary.exists() {
        if let Ok(content) = std::fs::read_to_string(&primary) {
            if let Ok(cfg) = serde_json::from_str::<AppConfig>(&content) {
                return cfg;
            }
        }
    }

    // Try legacy migration
    if let Some(legacy) = find_legacy_config() {
        if let Some(cfg) = migrate_legacy_config(&legacy) {
            // Save migrated config to new location for next time
            let _ = save_config(&cfg);
            tracing::info!("Migrated config from legacy path: {:?}", legacy);
            return cfg;
        }
    }

    AppConfig::default()
}

pub fn save_config(config: &AppConfig) -> Result<(), PvError> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Backup existing config
    if path.exists() {
        let backup = path.with_extension("json.bak");
        let _ = std::fs::copy(&path, backup);
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| PvError::Config(e.to_string()))?;
    std::fs::write(&path, json)?;
    Ok(())
}
