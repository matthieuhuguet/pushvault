mod chunk_engine;
mod config;
mod error;
mod git_engine;
pub mod mcp_server;
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
            // Apply Windows 11 Mica dark effect to the title bar / window chrome
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                let _ = window_vibrancy::apply_mica(&window, Some(true));
            }

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
                // Save window state before minimizing to tray
                if let Ok(size) = window.inner_size() {
                    let app = window.app_handle();
                    if let Some(state) = app.try_state::<crate::state::AppState>() {
                        let config = state.config.clone();
                        tauri::async_runtime::spawn(async move {
                            let mut cfg = config.write().await;
                            cfg.window_width = size.width;
                            cfg.window_height = size.height;
                            drop(cfg);
                            let read_cfg = config.read().await;
                            let _ = crate::config::save_config(&*read_cfg);
                        });
                    }
                }
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
            commands::git::force_push,
            commands::git::force_push_with_lease,
            commands::git::pull_with_rebase,
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
            commands::git::rename_branch,
            commands::git::merge_branch,
            commands::git::push_branch,
            commands::git::get_conflicted_files,
            commands::git::resolve_using_ours,
            commands::git::resolve_using_theirs,
            commands::git::abort_merge,
            commands::git::get_commit_diff,
            commands::git::get_stash_diff,
            commands::git::delete_untracked_file,
            commands::git::sync_repo_with_progress,
            commands::git::list_tags,
            commands::git::create_tag,
            commands::git::delete_tag,
            commands::git::reset_repo,
            commands::git::revert_commit,
            commands::git::cherry_pick_commit,
            commands::git::get_remote_url,
            commands::git::stage_hunk,
            commands::git::discard_hunk,
            // maintenance
            commands::git::git_gc,
            commands::git::remote_prune,
            commands::git::fetch_prune,
            commands::git::get_head_info,
            commands::git::branch_from_head,
            commands::git::amend_commit_message,
            commands::git::get_last_commit_message,
            commands::git::push_tags,
            // worktree
            commands::git::list_worktrees,
            commands::git::add_worktree,
            commands::git::remove_worktree,
            // submodules
            commands::git::list_submodules,
            commands::git::update_submodules,
            commands::git::add_submodule,
            commands::git::remove_submodule,
            // interactive rebase
            commands::git::get_rebase_commits,
            commands::git::start_interactive_rebase,
            commands::git::rebase_continue,
            commands::git::rebase_abort,
            commands::git::rebase_in_progress,
            // git lfs
            commands::git::detect_lfs,
            commands::git::list_lfs_tracks,
            commands::git::lfs_track,
            commands::git::lfs_untrack,
            // git bisect
            commands::git::bisect_status,
            commands::git::bisect_start,
            commands::git::bisect_good,
            commands::git::bisect_bad,
            commands::git::bisect_skip,
            commands::git::bisect_reset,
            // git blame & reflog
            commands::git::git_blame,
            commands::git::git_reflog,
            // config commands
            commands::config::load_config_cmd,
            commands::config::save_config_cmd,
            commands::config::add_repo,
            commands::config::remove_repo,
            commands::config::update_repo,
            // system commands
            commands::system::open_in_explorer,
            commands::system::reveal_in_explorer,
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
            commands::system::save_window_state,
            commands::system::get_github_ci_status,
            commands::system::get_github_workflow_runs,
            commands::system::get_github_prs,
            commands::system::get_github_issues,
            commands::system::setup_file_watchers,
            commands::system::get_launch_at_startup,
            commands::system::set_launch_at_startup,
            commands::system::list_github_releases,
            commands::system::create_github_release,
            // credential store
            commands::system::get_stored_token,
            commands::system::store_token,
            commands::system::delete_stored_token,
            // portable mode
            commands::system::get_portable_mode,
            // binary file reading (image preview)
            commands::system::read_file_base64,
            commands::system::get_file_base64_at_ref,
            // global search
            commands::system::search_repos,
            // MCP integration
            commands::system::generate_mcp_config,
            commands::system::install_mcp_config,
            commands::system::ai_generate_commit_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PushVault");
}
