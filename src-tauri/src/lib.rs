mod chunk_engine;
mod config;
mod error;
mod git_engine;
mod models;
mod state;
pub mod commands;

pub use state::AppState;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WebviewWindow};

pub fn run() {
    let cfg = config::load_config();
    let state = AppState::new(cfg);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .setup(|app| {
            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "Show PushVault", true, None::<&str>)?;
            let sync_item = MenuItem::with_id(app, "sync", "Sync All", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit PushVault", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &sync_item, &sep, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("PushVault")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = WebviewWindow::show(&window);
                            let _ = WebviewWindow::set_focus(&window);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let visible = WebviewWindow::is_visible(&window).unwrap_or(false);
                            if visible {
                                let _ = WebviewWindow::hide(&window);
                            } else {
                                let _ = WebviewWindow::show(&window);
                                let _ = WebviewWindow::set_focus(&window);
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray instead of closing
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // git commands
            commands::git::get_repo_status,
            commands::git::fetch_repo,
            commands::git::pull_repo,
            commands::git::push_repo,
            commands::git::sync_all,
            commands::git::get_staged_files,
            commands::git::get_unstaged_files,
            commands::git::stage_file,
            commands::git::unstage_file,
            commands::git::discard_file,
            commands::git::stage_all,
            commands::git::unstage_all,
            commands::git::commit_changes,
            commands::git::get_diff,
            commands::git::get_log,
            commands::git::get_stashes,
            commands::git::save_stash,
            commands::git::apply_stash,
            commands::git::pop_stash,
            commands::git::drop_stash,
            commands::git::clone_repo,
            commands::git::list_branches,
            commands::git::create_branch,
            commands::git::switch_branch,
            commands::git::delete_branch,
            commands::git::get_conflicted_files,
            commands::git::resolve_using_ours,
            commands::git::resolve_using_theirs,
            commands::git::abort_merge,
            commands::git::get_commit_diff,
            commands::git::delete_untracked_file,
            commands::git::sync_repo_with_progress,
            commands::git::list_tags,
            commands::git::create_tag,
            commands::git::delete_tag,
            commands::git::reset_repo,
            commands::git::revert_commit,
            commands::git::cherry_pick_commit,
            commands::git::get_remote_url,
            // config commands
            commands::config::load_config_cmd,
            commands::config::save_config_cmd,
            commands::config::add_repo,
            commands::config::remove_repo,
            commands::config::update_repo,
            // system commands
            commands::system::open_in_explorer,
            commands::system::open_in_vscode,
            commands::system::open_in_terminal,
            commands::system::quit_app,
            commands::system::show_window,
            commands::system::hide_window,
            commands::system::get_auto_check_interval,
            commands::system::read_gitignore,
            commands::system::write_gitignore,
            commands::system::scan_for_repos,
            commands::system::init_repo,
            commands::system::get_file_at_commit,
            commands::system::get_all_repo_statuses,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PushVault");
}
