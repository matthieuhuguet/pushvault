"""Configuration loading and validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import AppConfig, RepoConfig

DEFAULT_CONFIG = {
    "repos": [],
    "auto_check_interval_minutes": 5,
    "max_file_size_mb": 49,
    "batch_size": 50,
    "window": {"width": 400, "height": 860},
}


def load_config(config_path: Path) -> AppConfig:
    """Load and validate configuration from JSON file."""
    if not config_path.exists():
        save_config(config_path, AppConfig())
        return AppConfig()

    with open(config_path, "r", encoding="utf-8") as f:
        raw: dict[str, Any] = json.load(f)

    repos = []
    for r in raw.get("repos", []):
        if not isinstance(r, dict):
            continue
        if not all(k in r for k in ("name", "path", "remote")):
            continue
        repos.append(RepoConfig(
            name=r["name"],
            path=r["path"],
            remote=r["remote"],
            icon=r.get("icon", "folder"),
            color=r.get("color", "#7C5CBF"),
        ))

    window = raw.get("window", {})

    return AppConfig(
        repos=repos,
        auto_check_interval_minutes=raw.get("auto_check_interval_minutes", 5),
        max_file_size_mb=raw.get("max_file_size_mb", 49),
        batch_size=raw.get("batch_size", 50),
        window_width=window.get("width", 400),
        window_height=window.get("height", 860),
    )


def save_config(config_path: Path, cfg: AppConfig) -> None:
    """Write configuration to JSON file."""
    data = {
        "repos": [
            {
                "name": r.name,
                "path": r.path,
                "remote": r.remote,
                "icon": r.icon,
                "color": r.color,
            }
            for r in cfg.repos
        ],
        "auto_check_interval_minutes": cfg.auto_check_interval_minutes,
        "max_file_size_mb": cfg.max_file_size_mb,
        "batch_size": cfg.batch_size,
        "window": {
            "width": cfg.window_width,
            "height": cfg.window_height,
        },
    }
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
