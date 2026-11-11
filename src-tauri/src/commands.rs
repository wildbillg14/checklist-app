//! Thin Tauri command wrappers around `db.rs`.
//! Every write emits `data-changed` to all windows so main + widget stay in sync.

use crate::db::{self, Db, Item, ItemWithContext, List, TodayView};
use tauri::{AppHandle, Emitter, State};

pub const DATA_CHANGED: &str = "data-changed";

/// Payload of the `data-changed` event: what kind of data changed.
pub fn notify_changed(app: &AppHandle, scope: &str) {
    if let Err(e) = app.emit(DATA_CHANGED, scope) {
        eprintln!("failed to emit {DATA_CHANGED}: {e}");
    }
}

/// Run a write against the DB, release the lock, then broadcast the change.
fn write<T>(
    app: &AppHandle,
    db: &State<Db>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let out = {
        let conn = db.conn()?;
        f(&conn)?
    };
    notify_changed(app, "data");
    Ok(out)
}

// ----- Lists ---------------------------------------------------------------

#[tauri::command]
pub fn get_lists(db: State<Db>) -> Result<Vec<List>, String> {
    db::get_lists(&*db.conn()?)
}

#[tauri::command]
pub fn create_list(app: AppHandle, db: State<Db>, name: String, is_template: bool) -> Result<List, String> {
    write(&app, &db, |c| db::create_list(c, &name, is_template))
}

#[tauri::command]
pub fn rename_list(app: AppHandle, db: State<Db>, id: i64, name: String) -> Result<(), String> {
    write(&app, &db, |c| db::rename_list(c, id, &name))
}

#[tauri::command]
pub fn set_list_accent(app: AppHandle, db: State<Db>, id: i64, color: Option<String>) -> Result<(), String> {
    write(&app, &db, |c| db::set_list_accent(c, id, color))
}

#[tauri::command]
pub fn delete_list(app: AppHandle, db: State<Db>, id: i64) -> Result<(), String> {
    write(&app, &db, |c| db::delete_list(c, id))
}

#[tauri::command]
pub fn reorder_lists(app: AppHandle, db: State<Db>, ids: Vec<i64>) -> Result<(), String> {
    write(&app, &db, |c| db::reorder_lists(c, &ids))
}

// ----- Items ---------------------------------------------------------------

#[tauri::command]
pub fn get_items(db: State<Db>, list_id: i64) -> Result<Vec<Item>, String> {
    db::get_items(&*db.conn()?, list_id)
}

#[tauri::command]
pub fn create_item(
    app: AppHandle,
    db: State<Db>,
    list_id: i64,
    parent_id: Option<i64>,
    title: String,
) -> Result<Item, String> {
    write(&app, &db, |c| db::create_item(c, list_id, parent_id, &title))
}

#[tauri::command]
pub fn rename_item(app: AppHandle, db: State<Db>, id: i64, title: String) -> Result<(), String> {
    write(&app, &db, |c| db::rename_item(c, id, &title))
}

#[tauri::command]
pub fn set_item_color(app: AppHandle, db: State<Db>, id: i64, color: Option<String>) -> Result<(), String> {
    write(&app, &db, |c| db::set_item_color(c, id, color))
}

#[tauri::command]
pub fn set_item_completed(app: AppHandle, db: State<Db>, id: i64, completed: bool) -> Result<(), String> {
    write(&app, &db, |c| db::set_item_completed(c, id, completed))
}

#[tauri::command]
pub fn delete_item(app: AppHandle, db: State<Db>, id: i64) -> Result<(), String> {
    write(&app, &db, |c| db::delete_item(c, id))
}

#[tauri::command]
pub fn reorder_items(app: AppHandle, db: State<Db>, ids: Vec<i64>) -> Result<(), String> {
    write(&app, &db, |c| db::reorder_items(c, &ids))
}

#[tauri::command]
pub fn move_item(app: AppHandle, db: State<Db>, id: i64, list_id: i64) -> Result<(), String> {
    write(&app, &db, |c| db::move_item(c, id, list_id))
}

#[tauri::command]
pub fn clear_completed(app: AppHandle, db: State<Db>, list_id: i64) -> Result<usize, String> {
    write(&app, &db, |c| db::clear_completed(c, list_id))
}

#[tauri::command]
pub fn set_item_due(
    app: AppHandle,
    db: State<Db>,
    id: i64,
    due_at: Option<i64>,
    all_day: bool,
    heads_up_minutes: Option<i64>,
) -> Result<(), String> {
    write(&app, &db, |c| db::set_item_due(c, id, due_at, all_day, heads_up_minutes))
}

// ----- Templates -----------------------------------------------------------

#[tauri::command]
pub fn save_list_as_template(app: AppHandle, db: State<Db>, list_id: i64, name: String) -> Result<List, String> {
    write(&app, &db, |c| db::save_list_as_template(c, list_id, &name))
}

#[tauri::command]
pub fn create_list_from_template(
    app: AppHandle,
    db: State<Db>,
    template_id: i64,
    name: String,
) -> Result<List, String> {
    write(&app, &db, |c| db::create_list_from_template(c, template_id, &name))
}

// ----- Search + today ------------------------------------------------------

#[tauri::command]
pub fn search(db: State<Db>, query: String) -> Result<Vec<ItemWithContext>, String> {
    db::search(&*db.conn()?, &query)
}

/// Epoch-ms bounds of the current local day: (now, start of today, start of tomorrow).
pub fn local_day_bounds() -> (i64, i64, i64) {
    use chrono::{Days, Local, TimeZone};
    let now = Local::now();
    let today = now.date_naive();
    let start_of = |d: chrono::NaiveDate| {
        Local
            .from_local_datetime(&d.and_hms_opt(0, 0, 0).expect("midnight is valid"))
            .earliest()
            .map(|t| t.timestamp_millis())
            // DST gap at midnight (rare): fall back to 1 AM.
            .unwrap_or_else(|| {
                Local
                    .from_local_datetime(&d.and_hms_opt(1, 0, 0).expect("1 AM is valid"))
                    .earliest()
                    .map(|t| t.timestamp_millis())
                    .unwrap_or(0)
            })
    };
    let tomorrow = today.checked_add_days(Days::new(1)).unwrap_or(today);
    (now.timestamp_millis(), start_of(today), start_of(tomorrow))
}

#[tauri::command]
pub fn get_today(db: State<Db>) -> Result<TodayView, String> {
    let (now, start, end) = local_day_bounds();
    db::get_today(&*db.conn()?, now, start, end)
}

// ----- Mini view quick add ---------------------------------------------------

/// Add a task to the Inbox, due today: at `due_at` if a time was given, else all day.
#[tauri::command]
pub fn quick_add(app: AppHandle, db: State<Db>, title: String, due_at: Option<i64>) -> Result<Item, String> {
    let (_, today_start, _) = local_day_bounds();
    write(&app, &db, |c| {
        let inbox = db::inbox_id(c)?;
        let item = db::create_item(c, inbox, None, &title)?;
        match due_at {
            Some(t) => db::set_item_due(c, item.id, Some(t), false, None)?,
            None => db::set_item_due(c, item.id, Some(today_start), true, None)?,
        }
        db::get_item(c, item.id)
    })
}

// ----- Background image ----------------------------------------------------

const IMAGE_EXTS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
const MAX_IMAGE_BYTES: u64 = 30 * 1024 * 1024;

/// Copy a user-picked image into `{app_data_dir}/backgrounds/` (the only folder the
/// asset protocol may read) and return the copy's absolute path. Older copies are removed.
#[tauri::command]
pub fn import_background(app: AppHandle, source: String) -> Result<String, String> {
    use std::path::Path;
    use tauri::Manager;

    let src = Path::new(&source);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| IMAGE_EXTS.contains(&e.as_str()))
        .ok_or_else(|| format!("Unsupported image type. Use one of: {}", IMAGE_EXTS.join(", ")))?;
    let meta = std::fs::metadata(src).map_err(|e| format!("Can't read {}: {e}", src.display()))?;
    if !meta.is_file() {
        return Err(format!("{} is not a file", src.display()));
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("That image is larger than 30 MB".into());
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data folder: {e}"))?
        .join("backgrounds");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
    let dest = dir.join(format!("background-{}.{ext}", db::now_ms()));
    std::fs::copy(src, &dest).map_err(|e| format!("Couldn't copy the image: {e}"))?;

    // Keep the folder tidy: only the newest background is needed.
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path() != dest {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    Ok(dest.to_string_lossy().into_owned())
}

// ----- Settings ------------------------------------------------------------

#[tauri::command]
pub fn get_settings(db: State<Db>) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    db::get_settings(&*db.conn()?)
}

#[tauri::command]
pub fn set_setting(app: AppHandle, db: State<Db>, key: String, value: serde_json::Value) -> Result<(), String> {
    db::set_setting(&*db.conn()?, &key, &value)?;
    notify_changed(&app, "settings");
    Ok(())
}
