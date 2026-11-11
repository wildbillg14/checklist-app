mod commands;
mod db;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let conn = db::open(&dir)?;
            app.manage(db::Db(Mutex::new(conn)));
            Ok(())
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
            commands::get_settings,
            commands::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
