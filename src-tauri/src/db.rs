//! SQLite data layer. Rust owns the database; the frontend only calls commands.
//!
//! Every function here takes a plain `&Connection` so it can be unit-tested
//! against an in-memory database. `commands.rs` wraps them as Tauri commands.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

/// Tauri-managed state holding the single connection.
pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn conn(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.0
            .lock()
            .map_err(|_| "Database lock was poisoned by an earlier crash".to_string())
    }
}

/// Map rusqlite errors into the `Result<T, String>` shape commands return.
pub trait DbErr<T> {
    fn db(self) -> Result<T, String>;
}
impl<T> DbErr<T> for rusqlite::Result<T> {
    fn db(self) -> Result<T, String> {
        self.map_err(|e| format!("Database error: {e}"))
    }
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ---------------------------------------------------------------------------
// Opening + migrations
// ---------------------------------------------------------------------------

pub fn open(dir: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Could not create data folder {}: {e}", dir.display()))?;
    let path = dir.join("checklist.db");
    let conn = Connection::open(&path)
        .map_err(|e| format!("Could not open database {}: {e}", path.display()))?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> Result<(), String> {
    // journal_mode returns a row, so it must be queried rather than executed.
    let _mode: String = conn
        .query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))
        .db()?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
        .db()
}

const SCHEMA_V1: &str = r#"
CREATE TABLE lists (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  accent_color  TEXT,
  is_template   INTEGER NOT NULL DEFAULT 0,
  is_inbox      INTEGER NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE items (
  id                    INTEGER PRIMARY KEY,
  list_id               INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  parent_id             INTEGER REFERENCES items(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  color                 TEXT,
  due_at                INTEGER,
  due_all_day           INTEGER NOT NULL DEFAULT 0,
  heads_up_minutes      INTEGER,
  notified_at           INTEGER,
  heads_up_notified_at  INTEGER,
  completed_at          INTEGER,
  position              INTEGER NOT NULL,
  created_at            INTEGER NOT NULL
);

CREATE INDEX idx_items_list   ON items(list_id, parent_id, position);
CREATE INDEX idx_items_parent ON items(parent_id);
CREATE INDEX idx_items_due    ON items(due_at) WHERE due_at IS NOT NULL;

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"#;

pub fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .db()?;
    if version < 1 {
        conn.execute_batch(&format!(
            "BEGIN;
             {SCHEMA_V1}
             INSERT INTO lists (name, is_inbox, position, created_at) VALUES ('Inbox', 1, 0, {now});
             PRAGMA user_version = 1;
             COMMIT;",
            now = now_ms()
        ))
        .map_err(|e| format!("Migration to schema v1 failed: {e}"))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct List {
    pub id: i64,
    pub name: String,
    pub accent_color: Option<String>,
    pub is_template: bool,
    pub is_inbox: bool,
    pub position: i64,
    pub created_at: i64,
}

const LIST_COLS: &str = "id, name, accent_color, is_template, is_inbox, position, created_at";

fn list_from_row(r: &Row) -> rusqlite::Result<List> {
    Ok(List {
        id: r.get(0)?,
        name: r.get(1)?,
        accent_color: r.get(2)?,
        is_template: r.get(3)?,
        is_inbox: r.get(4)?,
        position: r.get(5)?,
        created_at: r.get(6)?,
    })
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: i64,
    pub list_id: i64,
    pub parent_id: Option<i64>,
    pub title: String,
    pub color: Option<String>,
    pub due_at: Option<i64>,
    pub due_all_day: bool,
    pub heads_up_minutes: Option<i64>,
    pub notified_at: Option<i64>,
    pub heads_up_notified_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub position: i64,
    pub created_at: i64,
}

/// Item columns, always selected through the alias `i`.
pub const ITEM_COLS: &str = "i.id, i.list_id, i.parent_id, i.title, i.color, i.due_at, \
    i.due_all_day, i.heads_up_minutes, i.notified_at, i.heads_up_notified_at, \
    i.completed_at, i.position, i.created_at";
pub const ITEM_COL_COUNT: usize = 13;

pub fn item_from_row(r: &Row) -> rusqlite::Result<Item> {
    Ok(Item {
        id: r.get(0)?,
        list_id: r.get(1)?,
        parent_id: r.get(2)?,
        title: r.get(3)?,
        color: r.get(4)?,
        due_at: r.get(5)?,
        due_all_day: r.get(6)?,
        heads_up_minutes: r.get(7)?,
        notified_at: r.get(8)?,
        heads_up_notified_at: r.get(9)?,
        completed_at: r.get(10)?,
        position: r.get(11)?,
        created_at: r.get(12)?,
    })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn clean_name(raw: &str, what: &str) -> Result<String, String> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(format!("{what} can't be empty"));
    }
    if s.chars().count() > 500 {
        return Err(format!("{what} is too long (max 500 characters)"));
    }
    Ok(s.to_string())
}

pub fn validate_color(color: Option<String>) -> Result<Option<String>, String> {
    match color {
        None => Ok(None),
        Some(c) => {
            let ok = c.len() == 7
                && c.starts_with('#')
                && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
            if ok {
                Ok(Some(c.to_lowercase()))
            } else {
                Err(format!("'{c}' is not a valid color (expected #rrggbb)"))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

pub fn get_lists(conn: &Connection) -> Result<Vec<List>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {LIST_COLS} FROM lists ORDER BY is_inbox DESC, is_template, position, id"
        ))
        .db()?;
    let rows = stmt.query_map([], list_from_row).db()?;
    rows.collect::<rusqlite::Result<Vec<_>>>().db()
}

pub fn get_list(conn: &Connection, id: i64) -> Result<List, String> {
    conn.query_row(
        &format!("SELECT {LIST_COLS} FROM lists WHERE id = ?1"),
        [id],
        list_from_row,
    )
    .optional()
    .db()?
    .ok_or_else(|| format!("List {id} no longer exists"))
}

pub fn inbox_id(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT id FROM lists WHERE is_inbox = 1 LIMIT 1", [], |r| r.get(0))
        .optional()
        .db()?
        .ok_or_else(|| "Inbox list is missing".to_string())
}

fn next_list_position(conn: &Connection, is_template: bool) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM lists WHERE is_template = ?1",
        [is_template],
        |r| r.get(0),
    )
    .db()
}

pub fn create_list(conn: &Connection, name: &str, is_template: bool) -> Result<List, String> {
    let name = clean_name(name, "List name")?;
    let pos = next_list_position(conn, is_template)?;
    conn.execute(
        "INSERT INTO lists (name, is_template, position, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![name, is_template, pos, now_ms()],
    )
    .db()?;
    get_list(conn, conn.last_insert_rowid())
}

pub fn rename_list(conn: &Connection, id: i64, name: &str) -> Result<(), String> {
    let list = get_list(conn, id)?;
    if list.is_inbox {
        return Err("The Inbox can't be renamed".into());
    }
    let name = clean_name(name, "List name")?;
    conn.execute("UPDATE lists SET name = ?1 WHERE id = ?2", params![name, id])
        .db()?;
    Ok(())
}

pub fn set_list_accent(conn: &Connection, id: i64, color: Option<String>) -> Result<(), String> {
    get_list(conn, id)?;
    let color = validate_color(color)?;
    conn.execute(
        "UPDATE lists SET accent_color = ?1 WHERE id = ?2",
        params![color, id],
    )
    .db()?;
    Ok(())
}

pub fn delete_list(conn: &Connection, id: i64) -> Result<(), String> {
    let list = get_list(conn, id)?;
    if list.is_inbox {
        return Err("The Inbox can't be deleted".into());
    }
    conn.execute("DELETE FROM lists WHERE id = ?1", [id]).db()?;
    Ok(())
}

/// Set positions from the given order. The Inbox is always pinned first, so it is skipped.
pub fn reorder_lists(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    let tx = conn.unchecked_transaction().db()?;
    {
        let mut stmt = tx
            .prepare("UPDATE lists SET position = ?1 WHERE id = ?2 AND is_inbox = 0")
            .db()?;
        for (pos, id) in ids.iter().enumerate() {
            stmt.execute(params![pos as i64 + 1, id]).db()?;
        }
    }
    tx.commit().db()
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/// All items in a list (top level and sub-items), each group in position order.
pub fn get_items(conn: &Connection, list_id: i64) -> Result<Vec<Item>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ITEM_COLS} FROM items i WHERE i.list_id = ?1 \
             ORDER BY i.parent_id IS NOT NULL, i.position, i.id"
        ))
        .db()?;
    let rows = stmt.query_map([list_id], item_from_row).db()?;
    rows.collect::<rusqlite::Result<Vec<_>>>().db()
}

pub fn get_item(conn: &Connection, id: i64) -> Result<Item, String> {
    conn.query_row(
        &format!("SELECT {ITEM_COLS} FROM items i WHERE i.id = ?1"),
        [id],
        item_from_row,
    )
    .optional()
    .db()?
    .ok_or_else(|| format!("Item {id} no longer exists"))
}

fn next_item_position(conn: &Connection, list_id: i64, parent_id: Option<i64>) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM items WHERE list_id = ?1 AND parent_id IS ?2",
        params![list_id, parent_id],
        |r| r.get(0),
    )
    .db()
}

pub fn create_item(
    conn: &Connection,
    list_id: i64,
    parent_id: Option<i64>,
    title: &str,
) -> Result<Item, String> {
    let title = clean_name(title, "Task name")?;
    get_list(conn, list_id)?;
    if let Some(pid) = parent_id {
        let parent = get_item(conn, pid)?;
        if parent.parent_id.is_some() {
            return Err("Sub-items can only be one level deep".into());
        }
        if parent.list_id != list_id {
            return Err("A sub-item must be in the same list as its parent".into());
        }
    }
    let pos = next_item_position(conn, list_id, parent_id)?;
    conn.execute(
        "INSERT INTO items (list_id, parent_id, title, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![list_id, parent_id, title, pos, now_ms()],
    )
    .db()?;
    get_item(conn, conn.last_insert_rowid())
}

pub fn rename_item(conn: &Connection, id: i64, title: &str) -> Result<(), String> {
    let title = clean_name(title, "Task name")?;
    get_item(conn, id)?;
    conn.execute("UPDATE items SET title = ?1 WHERE id = ?2", params![title, id])
        .db()?;
    Ok(())
}

pub fn set_item_color(conn: &Connection, id: i64, color: Option<String>) -> Result<(), String> {
    get_item(conn, id)?;
    let color = validate_color(color)?;
    conn.execute("UPDATE items SET color = ?1 WHERE id = ?2", params![color, id])
        .db()?;
    Ok(())
}

pub fn set_item_completed(conn: &Connection, id: i64, completed: bool) -> Result<(), String> {
    get_item(conn, id)?;
    let value = if completed { Some(now_ms()) } else { None };
    conn.execute(
        "UPDATE items SET completed_at = ?1 WHERE id = ?2",
        params![value, id],
    )
    .db()?;
    Ok(())
}

pub fn delete_item(conn: &Connection, id: i64) -> Result<(), String> {
    get_item(conn, id)?;
    conn.execute("DELETE FROM items WHERE id = ?1", [id]).db()?;
    Ok(())
}

/// Set positions from the given order (siblings sharing one parent).
pub fn reorder_items(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    let tx = conn.unchecked_transaction().db()?;
    {
        let mut stmt = tx
            .prepare("UPDATE items SET position = ?1 WHERE id = ?2")
            .db()?;
        for (pos, id) in ids.iter().enumerate() {
            stmt.execute(params![pos as i64 + 1, id]).db()?;
        }
    }
    tx.commit().db()
}

/// Move an item (with its sub-items) to the end of another list.
/// A sub-item that is moved becomes a top-level item in the target list.
pub fn move_item(conn: &Connection, id: i64, target_list_id: i64) -> Result<(), String> {
    let item = get_item(conn, id)?;
    get_list(conn, target_list_id)?;
    if item.list_id == target_list_id && item.parent_id.is_none() {
        return Ok(());
    }
    let pos = next_item_position(conn, target_list_id, None)?;
    let tx = conn.unchecked_transaction().db()?;
    tx.execute(
        "UPDATE items SET list_id = ?1, parent_id = NULL, position = ?2 WHERE id = ?3",
        params![target_list_id, pos, id],
    )
    .db()?;
    tx.execute(
        "UPDATE items SET list_id = ?1 WHERE parent_id = ?2",
        params![target_list_id, id],
    )
    .db()?;
    tx.commit().db()
}

/// Delete every completed item in a list. Returns how many rows were removed.
pub fn clear_completed(conn: &Connection, list_id: i64) -> Result<usize, String> {
    get_list(conn, list_id)?;
    conn.execute(
        "DELETE FROM items WHERE list_id = ?1 AND completed_at IS NOT NULL",
        [list_id],
    )
    .db()
}

// ---------------------------------------------------------------------------
// Settings (JSON values)
// ---------------------------------------------------------------------------

pub fn get_settings(conn: &Connection) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings").db()?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .db()?;
    let mut map = serde_json::Map::new();
    for row in rows {
        let (k, v) = row.db()?;
        // A corrupt value is skipped so the frontend falls back to its default.
        if let Ok(value) = serde_json::from_str(&v) {
            map.insert(k, value);
        }
    }
    Ok(map)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<serde_json::Value>, String> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .optional()
        .db()?;
    Ok(raw.and_then(|s| serde_json::from_str(&s).ok()))
}

pub fn set_setting(conn: &Connection, key: &str, value: &serde_json::Value) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("Setting key can't be empty".into());
    }
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value.to_string()],
    )
    .db()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migration_seeds_inbox_once() {
        let conn = mem();
        migrate(&conn).unwrap(); // idempotent
        let lists = get_lists(&conn).unwrap();
        assert_eq!(lists.len(), 1);
        assert!(lists[0].is_inbox);
        assert_eq!(lists[0].name, "Inbox");
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
    }

    #[test]
    fn inbox_is_protected() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        assert!(rename_list(&conn, inbox, "X").is_err());
        assert!(delete_list(&conn, inbox).is_err());
    }

    #[test]
    fn lists_reorder_with_inbox_pinned() {
        let conn = mem();
        let a = create_list(&conn, "A", false).unwrap();
        let b = create_list(&conn, "B", false).unwrap();
        let c = create_list(&conn, "C", false).unwrap();
        reorder_lists(&conn, &[c.id, a.id, b.id]).unwrap();
        let names: Vec<_> = get_lists(&conn).unwrap().into_iter().map(|l| l.name).collect();
        assert_eq!(names, ["Inbox", "C", "A", "B"]);
    }

    #[test]
    fn subitems_are_one_level_deep() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let p = create_item(&conn, inbox, None, "Parent").unwrap();
        let c = create_item(&conn, inbox, Some(p.id), "Child").unwrap();
        assert!(create_item(&conn, inbox, Some(c.id), "Grandchild").is_err());
    }

    #[test]
    fn delete_parent_cascades() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let p = create_item(&conn, inbox, None, "Parent").unwrap();
        create_item(&conn, inbox, Some(p.id), "Child").unwrap();
        delete_item(&conn, p.id).unwrap();
        assert!(get_items(&conn, inbox).unwrap().is_empty());
    }

    #[test]
    fn move_item_takes_children() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let other = create_list(&conn, "Other", false).unwrap();
        let p = create_item(&conn, inbox, None, "Parent").unwrap();
        create_item(&conn, inbox, Some(p.id), "Child").unwrap();
        move_item(&conn, p.id, other.id).unwrap();
        assert!(get_items(&conn, inbox).unwrap().is_empty());
        assert_eq!(get_items(&conn, other.id).unwrap().len(), 2);
    }

    #[test]
    fn clear_completed_only_removes_done() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let a = create_item(&conn, inbox, None, "A").unwrap();
        create_item(&conn, inbox, None, "B").unwrap();
        set_item_completed(&conn, a.id, true).unwrap();
        assert_eq!(clear_completed(&conn, inbox).unwrap(), 1);
        let left: Vec<_> = get_items(&conn, inbox).unwrap().into_iter().map(|i| i.title).collect();
        assert_eq!(left, ["B"]);
    }

    #[test]
    fn item_reorder_and_color_validation() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let a = create_item(&conn, inbox, None, "A").unwrap();
        let b = create_item(&conn, inbox, None, "B").unwrap();
        reorder_items(&conn, &[b.id, a.id]).unwrap();
        let titles: Vec<_> = get_items(&conn, inbox).unwrap().into_iter().map(|i| i.title).collect();
        assert_eq!(titles, ["B", "A"]);
        assert!(set_item_color(&conn, a.id, Some("red".into())).is_err());
        set_item_color(&conn, a.id, Some("#FF0000".into())).unwrap();
        assert_eq!(get_item(&conn, a.id).unwrap().color.as_deref(), Some("#ff0000"));
    }

    #[test]
    fn settings_roundtrip() {
        let conn = mem();
        set_setting(&conn, "theme", &serde_json::json!("dark")).unwrap();
        set_setting(&conn, "theme", &serde_json::json!("light")).unwrap();
        assert_eq!(get_setting(&conn, "theme").unwrap(), Some(serde_json::json!("light")));
    }
}
