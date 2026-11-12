//! The global "toggle mini view" hotkey: configurable, persisted in settings
//! (`toggleHotkey`), re-registered on change, and honest about conflicts.

use crate::commands::notify_changed;
use crate::db::{self, Db};
use serde::Serialize;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

pub const DEFAULT_COMBO: &str = "Ctrl+Alt+L";
const SETTING_KEY: &str = "toggleHotkey";

struct Inner {
    /// Normalized label, e.g. "Ctrl+Alt+L".
    combo: String,
    shortcut: Shortcut,
    /// Whether the OS accepted the registration right now.
    registered: bool,
    /// Temporarily unregistered while Settings records a new combo.
    paused: bool,
    /// Conflict message when another program owns the combo.
    error: Option<String>,
}

pub struct HotkeyState(Mutex<Inner>);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyInfo {
    pub combo: String,
    pub error: Option<String>,
}

fn conflict(combo: &str) -> String {
    format!(
        "{combo} is already used by another program, so the mini-view hotkey is off. \
         Record a different combo, or use the ⤡ button or the tray icon."
    )
}

/// Parse "Ctrl+Alt+L"-style text into a shortcut plus a normalized label.
/// Requires one key (letter, digit, F1–F24 or Space) and at least one of
/// Ctrl/Alt/Win (Shift alone would swallow normal typing).
pub fn parse_combo(input: &str) -> Result<(Shortcut, String), String> {
    let mut mods = Modifiers::empty();
    let mut key: Option<(Code, String)> = None;
    for raw in input.split('+') {
        let token = raw.trim();
        if token.is_empty() {
            return Err(format!("'{input}' isn't a valid shortcut"));
        }
        match token.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "win" | "super" | "meta" | "cmd" => mods |= Modifiers::SUPER,
            _ => {
                if key.is_some() {
                    return Err("Use one key plus modifiers, like Ctrl+Alt+L".into());
                }
                key = Some(parse_key(token)?);
            }
        }
    }
    let (code, label) = key.ok_or("Add a key, like Ctrl+Alt+L")?;
    if !mods.intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER) {
        return Err("Include Ctrl, Alt or Win so normal typing isn't captured".into());
    }
    let mut parts = Vec::new();
    for (flag, name) in [
        (Modifiers::CONTROL, "Ctrl"),
        (Modifiers::ALT, "Alt"),
        (Modifiers::SHIFT, "Shift"),
        (Modifiers::SUPER, "Win"),
    ] {
        if mods.contains(flag) {
            parts.push(name.to_string());
        }
    }
    parts.push(label);
    Ok((Shortcut::new(Some(mods), code), parts.join("+")))
}

fn parse_key(token: &str) -> Result<(Code, String), String> {
    let upper = token.to_ascii_uppercase();
    let single = upper.len() == 1;
    let name = if single && upper.chars().all(|c| c.is_ascii_alphabetic()) {
        format!("Key{upper}")
    } else if single && upper.chars().all(|c| c.is_ascii_digit()) {
        format!("Digit{upper}")
    } else if upper.starts_with('F') && upper[1..].parse::<u8>().is_ok_and(|n| (1..=24).contains(&n)) {
        upper.clone()
    } else if upper == "SPACE" {
        "Space".into()
    } else {
        return Err(format!("'{token}' isn't supported. Use a letter, digit, F1–F24 or Space"));
    };
    let code = Code::from_str(&name).map_err(|_| format!("Unknown key '{token}'"))?;
    let label = if upper == "SPACE" { "Space".to_string() } else { upper };
    Ok((code, label))
}

impl HotkeyState {
    fn info(&self) -> HotkeyInfo {
        let inner = self.0.lock().expect("hotkey lock");
        HotkeyInfo { combo: inner.combo.clone(), error: inner.error.clone() }
    }

    /// Is this the active toggle shortcut? (Called from the plugin handler.)
    pub fn matches(&self, pressed: &Shortcut) -> bool {
        self.0.lock().map(|i| i.registered && i.shortcut == *pressed).unwrap_or(false)
    }

    pub fn combo(&self) -> Option<String> {
        self.0.lock().ok().filter(|i| i.registered).map(|i| i.combo.clone())
    }
}

/// Register the stored (or default) combo at startup.
pub fn init(app: &AppHandle) {
    let stored = {
        let state = app.state::<Db>();
        state
            .conn()
            .ok()
            .and_then(|c| db::get_setting(&c, SETTING_KEY).ok().flatten())
            .and_then(|v| v.as_str().map(str::to_string))
    };
    let (shortcut, combo) = stored
        .as_deref()
        .and_then(|s| parse_combo(s).ok())
        .unwrap_or_else(|| parse_combo(DEFAULT_COMBO).expect("default hotkey is valid"));
    let error = app.global_shortcut().register(shortcut).err().map(|e| {
        eprintln!("Couldn't register {combo}: {e}");
        conflict(&combo)
    });
    app.manage(HotkeyState(Mutex::new(Inner {
        registered: error.is_none(),
        paused: false,
        error,
        combo,
        shortcut,
    })));
}

fn persist(app: &AppHandle, combo: &str) -> Result<(), String> {
    {
        let state = app.state::<Db>();
        let conn = state.conn()?;
        db::set_setting(&conn, SETTING_KEY, &serde_json::json!(combo))?;
    }
    notify_changed(app, "settings");
    Ok(())
}

// ----- commands ------------------------------------------------------------------

#[tauri::command]
pub fn get_hotkey(state: tauri::State<HotkeyState>) -> HotkeyInfo {
    state.info()
}

/// Switch to a new combo. If another program owns it, the previous combo is
/// restored and an error explains why; only a successful change is persisted.
#[tauri::command]
pub fn set_hotkey(app: AppHandle, combo: String) -> Result<HotkeyInfo, String> {
    let (shortcut, label) = parse_combo(&combo)?;
    let gs = app.global_shortcut();
    let state = app.state::<HotkeyState>();
    let result = {
        let mut inner = state.0.lock().map_err(|_| "Hotkey state is unavailable".to_string())?;
        if inner.registered {
            let _ = gs.unregister(inner.shortcut);
            inner.registered = false;
        }
        inner.paused = false;
        match gs.register(shortcut) {
            Ok(()) => {
                inner.shortcut = shortcut;
                inner.combo = label.clone();
                inner.registered = true;
                inner.error = None;
                Ok(())
            }
            Err(e) => {
                eprintln!("Couldn't register {label}: {e}");
                // Put the previous combo back (it may itself be in conflict).
                inner.registered = gs.register(inner.shortcut).is_ok();
                inner.error = if inner.registered { None } else { Some(conflict(&inner.combo)) };
                Err(format!(
                    "{label} is already used by another program. Keeping {}.",
                    inner.combo
                ))
            }
        }
    };
    crate::tray::sync(&app);
    result?;
    persist(&app, &label)?;
    Ok(state.info())
}

/// Unregister while Settings records a new combo (so pressing the current one
/// doesn't toggle windows), and register again afterwards.
#[tauri::command]
pub fn pause_hotkey(app: AppHandle, paused: bool) -> HotkeyInfo {
    let gs = app.global_shortcut();
    let state = app.state::<HotkeyState>();
    if let Ok(mut inner) = state.0.lock() {
        if paused && inner.registered {
            let _ = gs.unregister(inner.shortcut);
            inner.registered = false;
            inner.paused = true;
        } else if !paused && inner.paused {
            inner.paused = false;
            inner.registered = gs.register(inner.shortcut).is_ok();
            inner.error = if inner.registered { None } else { Some(conflict(&inner.combo)) };
        }
    }
    state.info()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_normalizes() {
        let (_, label) = parse_combo("alt + ctrl + l").unwrap();
        assert_eq!(label, "Ctrl+Alt+L");
        assert_eq!(parse_combo("Ctrl+Shift+F12").unwrap().1, "Ctrl+Shift+F12");
        assert_eq!(parse_combo("Win+Space").unwrap().1, "Win+Space");
        assert_eq!(parse_combo("Ctrl+Alt+7").unwrap().1, "Ctrl+Alt+7");
        assert_eq!(parse_combo(DEFAULT_COMBO).unwrap().0, Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyL));
    }

    #[test]
    fn rejects_bad_combos() {
        assert!(parse_combo("L").is_err()); // no modifier
        assert!(parse_combo("Shift+L").is_err()); // shift alone
        assert!(parse_combo("Ctrl+Alt").is_err()); // no key
        assert!(parse_combo("Ctrl+L+K").is_err()); // two keys
        assert!(parse_combo("Ctrl+Tab").is_err()); // unsupported key
        assert!(parse_combo("Ctrl++L").is_err());
    }
}
