mod commands;
mod db;
mod reminders;
mod tray;
mod windows;

use std::sync::Mutex;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

/// Passed by the autostart entry so the app starts hidden in the tray.
const MINIMIZED_FLAG: &str = "--minimized";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL);

    tauri::Builder::default()
        // Must be first: a second launch just focuses the running app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_current(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_FLAG]),
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // We decide visibility ourselves (mode + --minimized).
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_shortcut && event.state() == ShortcutState::Pressed {
                        windows::toggle(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let dir = app.path().app_data_dir()?;
            let conn = db::open(&dir)?;
            app.manage(db::Db(Mutex::new(conn)));

            let handle = app.handle().clone();
            let mode = windows::stored_mode(&handle);
            app.manage(windows::AppMode(Mutex::new(mode)));
            tray::create(&handle)?;

            // Another program can already own the combination; record that so
            // Settings can tell the user instead of failing silently.
            let hotkey_error = app.global_shortcut().register(toggle_shortcut).err().map(|e| {
                eprintln!("Couldn't register Ctrl+Shift+L: {e}");
                "Ctrl+Shift+L is already used by another program, so the mini-view hotkey is off. \
                 Use the ⤡ button or the tray icon instead."
                    .to_string()
            });
            app.manage(windows::HotkeyStatus(hotkey_error));

            reminders::start(handle);
            Ok(())
        })
        // Closing either window only hides it; the app keeps running in the tray.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_lists,
            commands::create_list,
            commands::rename_list,
            commands::set_list_accent,
            commands::delete_list,
            commands::reorder_lists,
            commands::get_items,
            commands::create_item,
            commands::rename_item,
            commands::set_item_color,
            commands::set_item_completed,
            commands::delete_item,
            commands::reorder_items,
            commands::move_item,
            commands::clear_completed,
            commands::set_item_due,
            commands::save_list_as_template,
            commands::create_list_from_template,
            commands::search,
            commands::get_today,
            commands::quick_add,
            commands::import_background,
            commands::get_settings,
            commands::set_setting,
            windows::toggle_mode,
            windows::set_pinned,
            windows::set_widget_collapsed,
            windows::hotkey_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Window work waits for the event loop, after window-state has restored
            // positions; otherwise topmost/size changes made in setup can be lost.
            if let RunEvent::Ready = event {
                windows::restore_widget(app);
                if !std::env::args().any(|a| a == MINIMIZED_FLAG) {
                    windows::show_mode(app, windows::current_mode(app));
                }
            }
        });
}
