//! Window/mode management: exactly one of the main window or the mini-view
//! widget is visible. Mode, pin and collapse state live in the settings table.

use crate::commands::notify_changed;
use crate::db::{self, Db};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewWindow};

pub const MAIN: &str = "main";
pub const WIDGET: &str = "widget";

const WIDGET_MIN_WIDTH: f64 = 240.0;
const WIDGET_MIN_HEIGHT: f64 = 200.0;
const WIDGET_DEFAULT_HEIGHT: f64 = 420.0;
/// Height of the widget when collapsed to its title bar.
const COLLAPSED_HEIGHT: f64 = 42.0;

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Main,
    Widget,
}

/// Current mode, kept in memory (and persisted as the `mode` setting).
pub struct AppMode(pub Mutex<Mode>);

// ----- settings helpers ------------------------------------------------------

fn setting(app: &AppHandle, key: &str) -> Option<serde_json::Value> {
    let state = app.state::<Db>();
    let conn = state.conn().ok()?;
    db::get_setting(&conn, key).ok().flatten()
}

pub fn setting_bool(app: &AppHandle, key: &str) -> bool {
    setting(app, key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn save_setting(app: &AppHandle, key: &str, value: serde_json::Value) -> Result<(), String> {
    {
        let state = app.state::<Db>();
        let conn = state.conn()?;
        db::set_setting(&conn, key, &value)?;
    }
    notify_changed(app, "settings");
    Ok(())
}

pub fn stored_mode(app: &AppHandle) -> Mode {
    setting(app, "mode")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or(Mode::Main)
}

pub fn current_mode(app: &AppHandle) -> Mode {
    app.state::<AppMode>().0.lock().map(|m| *m).unwrap_or(Mode::Main)
}

fn window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label)
        .ok_or_else(|| format!("The {label} window is missing"))
}

/// Set always-on-top for real. tao caches the flag and skips the Win32 call when it
/// thinks nothing changed, but Windows can drop topmost (e.g. while the window is
/// hidden at startup), so toggle it off first to force a fresh SetWindowPos.
fn force_topmost(w: &WebviewWindow, pinned: bool) -> tauri::Result<()> {
    w.set_always_on_top(false)?;
    if pinned {
        w.set_always_on_top(true)?;
    }
    Ok(())
}

// ----- mode switching ---------------------------------------------------------

/// Show the window for `mode` and hide the other one. Never both visible.
pub fn show_mode(app: &AppHandle, mode: Mode) {
    if let Ok(mut m) = app.state::<AppMode>().0.lock() {
        *m = mode;
    }
    let (show, hide) = match mode {
        Mode::Main => (MAIN, WIDGET),
        Mode::Widget => (WIDGET, MAIN),
    };
    if let Ok(w) = window(app, hide) {
        let _ = w.hide();
    }
    if let Ok(w) = window(app, show) {
        let _ = w.unminimize();
        let _ = w.show();
        if mode == Mode::Widget {
            // Re-apply after showing: Windows can drop topmost set on a hidden window.
            let _ = force_topmost(&w, setting_bool(app, "widgetPinned"));
        }
        let _ = w.set_focus();
    }
    if stored_mode(app) != mode {
        let _ = save_setting(app, "mode", serde_json::json!(mode));
    }
    crate::tray::sync(app);
}

/// Show whichever window belongs to the current mode (tray click, second launch).
pub fn show_current(app: &AppHandle) {
    show_mode(app, current_mode(app));
}

pub fn toggle(app: &AppHandle) -> Mode {
    let next = match current_mode(app) {
        Mode::Main => Mode::Widget,
        Mode::Widget => Mode::Main,
    };
    show_mode(app, next);
    next
}

/// Tray "Quick add": open the mini view (expanded) and focus its input.
pub fn open_quick_add(app: &AppHandle) {
    if setting_bool(app, "widgetCollapsed") {
        let _ = apply_collapsed(app, false);
    }
    show_mode(app, Mode::Widget);
    let _ = app.emit_to(WIDGET, "focus-quick-add", ());
}

// ----- widget pin / collapse ----------------------------------------------------

pub fn apply_pinned(app: &AppHandle, pinned: bool) -> Result<(), String> {
    force_topmost(&window(app, WIDGET)?, pinned).map_err(|e| format!("Couldn't change pin: {e}"))?;
    save_setting(app, "widgetPinned", serde_json::json!(pinned))?;
    crate::tray::sync(app);
    Ok(())
}

pub fn apply_collapsed(app: &AppHandle, collapsed: bool) -> Result<(), String> {
    let w = window(app, WIDGET)?;
    let scale = w.scale_factor().map_err(|e| e.to_string())?;
    let size = w.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let was_collapsed = setting_bool(app, "widgetCollapsed");
    if collapsed {
        if !was_collapsed && size.height > COLLAPSED_HEIGHT + 1.0 {
            save_setting(app, "widgetExpandedHeight", serde_json::json!(size.height))?;
        }
        let _ = w.set_min_size(Some(LogicalSize::new(WIDGET_MIN_WIDTH, COLLAPSED_HEIGHT)));
        w.set_size(LogicalSize::new(size.width, COLLAPSED_HEIGHT))
            .map_err(|e| e.to_string())?;
    } else {
        let height = setting(app, "widgetExpandedHeight")
            .and_then(|v| v.as_f64())
            .filter(|h| *h >= WIDGET_MIN_HEIGHT)
            .unwrap_or(WIDGET_DEFAULT_HEIGHT);
        w.set_size(LogicalSize::new(size.width, height)).map_err(|e| e.to_string())?;
        let _ = w.set_min_size(Some(LogicalSize::new(WIDGET_MIN_WIDTH, WIDGET_MIN_HEIGHT)));
    }
    save_setting(app, "widgetCollapsed", serde_json::json!(collapsed))
}

/// Apply persisted widget state at startup: pin, and a height that matches the
/// collapsed setting (the saved window size can disagree if the app was killed).
pub fn restore_widget(app: &AppHandle) {
    let Ok(w) = window(app, WIDGET) else { return };
    let _ = force_topmost(&w, setting_bool(app, "widgetPinned"));
    let collapsed = setting_bool(app, "widgetCollapsed");
    let min_h = if collapsed { COLLAPSED_HEIGHT } else { WIDGET_MIN_HEIGHT };
    let _ = w.set_min_size(Some(LogicalSize::new(WIDGET_MIN_WIDTH, min_h)));
    if let (Ok(scale), Ok(size)) = (w.scale_factor(), w.inner_size()) {
        let size = size.to_logical::<f64>(scale);
        let want = if collapsed {
            COLLAPSED_HEIGHT
        } else if size.height < WIDGET_MIN_HEIGHT {
            setting(app, "widgetExpandedHeight")
                .and_then(|v| v.as_f64())
                .filter(|h| *h >= WIDGET_MIN_HEIGHT)
                .unwrap_or(WIDGET_DEFAULT_HEIGHT)
        } else {
            size.height
        };
        if (want - size.height).abs() > 1.0 {
            let _ = w.set_size(LogicalSize::new(size.width, want));
        }
    }
}

// ----- commands ------------------------------------------------------------------

#[tauri::command]
pub fn toggle_mode(app: AppHandle) -> Result<Mode, String> {
    Ok(toggle(&app))
}

#[tauri::command]
pub fn set_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    apply_pinned(&app, pinned)
}

#[tauri::command]
pub fn set_widget_collapsed(app: AppHandle, collapsed: bool) -> Result<(), String> {
    apply_collapsed(&app, collapsed)
}
