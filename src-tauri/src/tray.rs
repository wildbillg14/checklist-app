//! System tray: Open, Mini view (toggle), Quick add, Pin on top, Quit.
//! Left-click shows the window for the current mode.

use crate::windows::{self, Mode};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Menu items whose checked state mirrors app state.
pub struct TrayItems {
    mini: CheckMenuItem<Wry>,
    pin: CheckMenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let mini = CheckMenuItem::with_id(app, "mini", "Mini view", true, false, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "Quick add", true, None::<&str>)?;
    let pin = CheckMenuItem::with_id(app, "pin", "Pin on top", true, false, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &mini,
            &quick,
            &pin,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    TrayIconBuilder::with_id("checklist-tray")
        .icon(icon)
        .tooltip("Checklist")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => windows::show_mode(app, Mode::Main),
            "mini" => {
                windows::toggle(app);
            }
            "quick" => windows::open_quick_add(app),
            "pin" => {
                let pinned = !windows::setting_bool(app, "widgetPinned");
                if let Err(e) = windows::apply_pinned(app, pinned) {
                    eprintln!("{e}");
                }
            }
            "quit" => self::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::show_current(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayItems { mini, pin });
    sync(app);
    Ok(())
}

/// Make the check marks match the current mode and pin state.
pub fn sync(app: &AppHandle) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.mini.set_checked(windows::current_mode(app) == Mode::Widget);
        let _ = items.pin.set_checked(windows::setting_bool(app, "widgetPinned"));
        // Show the active toggle hotkey next to "Mini view" (none if it's in conflict).
        let combo = app
            .try_state::<crate::hotkey::HotkeyState>()
            .and_then(|h| h.combo())
            .map(|c| c.replace("Win+", "Super+"));
        let _ = items.mini.set_accelerator(combo.as_deref());
    }
}

/// The only way to really exit: save window positions, then quit.
pub fn quit(app: &AppHandle) {
    let _ = app.save_window_state(StateFlags::all() & !StateFlags::VISIBLE);
    app.exit(0);
}
