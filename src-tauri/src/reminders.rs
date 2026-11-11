//! Reminder engine: a background thread that checks every 30 s for tasks that
//! are due (or whose early heads-up is due) and shows a Windows notification.
//! It reads the same SQLite connection as the commands, so it works while
//! both windows are hidden.

use crate::commands::notify_changed;
use crate::db::{self, Db, DbErr};
use rusqlite::{params, Connection};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

const TICK: Duration = Duration::from_secs(30);
/// On startup, anything overdue by more than this is marked silently.
const STALE_MS: i64 = 60 * 60 * 1000;

#[derive(Debug, Clone, PartialEq)]
pub enum Kind {
    Due,
    HeadsUp(i64),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Reminder {
    pub item_id: i64,
    pub title: String,
    pub list_name: String,
    pub due_at: i64,
    pub kind: Kind,
}

/// Common filter: timed, incomplete items in real (non-template) lists.
const ACTIVE: &str = "i.completed_at IS NULL AND i.due_at IS NOT NULL AND i.due_all_day = 0 AND l.is_template = 0";

/// Find reminders that should fire at `now`, stamp them, and return them.
/// A heads-up whose due time has already passed is stamped without firing
/// (the due notification covers it).
pub fn collect(conn: &Connection, now: i64) -> Result<Vec<Reminder>, String> {
    let tx = conn.unchecked_transaction().db()?;
    let mut out = Vec::new();

    let heads_up: Vec<(Reminder, bool)> = {
        let mut stmt = tx
            .prepare(&format!(
                "SELECT i.id, i.title, l.name, i.due_at, i.heads_up_minutes FROM items i \
                 JOIN lists l ON l.id = i.list_id \
                 WHERE {ACTIVE} AND i.heads_up_minutes IS NOT NULL AND i.heads_up_notified_at IS NULL \
                 AND i.due_at - i.heads_up_minutes * 60000 <= ?1 ORDER BY i.due_at"
            ))
            .db()?;
        let rows = stmt
            .query_map([now], |r| {
                let due_at: i64 = r.get(3)?;
                Ok((
                    Reminder {
                        item_id: r.get(0)?,
                        title: r.get(1)?,
                        list_name: r.get(2)?,
                        due_at,
                        kind: Kind::HeadsUp(r.get(4)?),
                    },
                    due_at > now,
                ))
            })
            .db()?;
        rows.collect::<rusqlite::Result<Vec<_>>>().db()?
    };
    for (rem, fire) in heads_up {
        tx.execute("UPDATE items SET heads_up_notified_at = ?1 WHERE id = ?2", params![now, rem.item_id])
            .db()?;
        if fire {
            out.push(rem);
        }
    }

    let due: Vec<Reminder> = {
        let mut stmt = tx
            .prepare(&format!(
                "SELECT i.id, i.title, l.name, i.due_at FROM items i \
                 JOIN lists l ON l.id = i.list_id \
                 WHERE {ACTIVE} AND i.notified_at IS NULL AND i.due_at <= ?1 ORDER BY i.due_at"
            ))
            .db()?;
        let rows = stmt
            .query_map([now], |r| {
                Ok(Reminder {
                    item_id: r.get(0)?,
                    title: r.get(1)?,
                    list_name: r.get(2)?,
                    due_at: r.get(3)?,
                    kind: Kind::Due,
                })
            })
            .db()?;
        rows.collect::<rusqlite::Result<Vec<_>>>().db()?
    };
    for rem in due {
        tx.execute(
            "UPDATE items SET notified_at = ?1, heads_up_notified_at = COALESCE(heads_up_notified_at, ?1) WHERE id = ?2",
            params![now, rem.item_id],
        )
        .db()?;
        out.push(rem);
    }

    tx.commit().db()?;
    Ok(out)
}

/// Startup sweep: silently mark items overdue by more than an hour.
/// Returns (items marked now, total overdue incomplete tasks).
pub fn startup_sweep(conn: &Connection, now: i64, today_start: i64) -> Result<(usize, i64), String> {
    let marked = conn
        .execute(
            &format!(
                "UPDATE items SET notified_at = ?1, heads_up_notified_at = COALESCE(heads_up_notified_at, ?1) \
                 WHERE id IN (SELECT i.id FROM items i JOIN lists l ON l.id = i.list_id \
                 WHERE {ACTIVE} AND i.notified_at IS NULL AND i.due_at < ?2)"
            ),
            params![now, now - STALE_MS],
        )
        .db()?;
    let overdue: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items i JOIN lists l ON l.id = i.list_id \
             WHERE i.completed_at IS NULL AND i.due_at IS NOT NULL AND l.is_template = 0 \
             AND ((i.due_all_day = 0 AND i.due_at < ?1) OR (i.due_all_day = 1 AND i.due_at < ?2))",
            params![now, today_start],
            |r| r.get(0),
        )
        .db()?;
    Ok((marked, overdue))
}

fn format_time(ms: i64) -> String {
    use chrono::{Local, TimeZone};
    Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|t| t.format("%-I:%M %p").to_string())
        .unwrap_or_default()
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("notification failed: {e}");
    }
}

fn show(app: &AppHandle, rem: &Reminder) {
    let time = format_time(rem.due_at);
    match rem.kind {
        Kind::Due => notify(app, &format!("Due now: {}", rem.title), &format!("{} · {time}", rem.list_name)),
        Kind::HeadsUp(m) => notify(
            app,
            &format!("In {m} min: {}", rem.title),
            &format!("Due at {time} · {}", rem.list_name),
        ),
    }
}

fn run_once(app: &AppHandle) -> Result<(), String> {
    let fired = {
        let state = app.state::<Db>();
        let conn = state.conn()?;
        collect(&conn, db::now_ms())?
    };
    for rem in &fired {
        show(app, rem);
    }
    if !fired.is_empty() {
        notify_changed(app, "data");
    }
    Ok(())
}

/// Start the reminder thread. Call once from `setup`.
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("reminders".into())
        .spawn(move || {
            let sweep = {
                let state = app.state::<Db>();
                let (now, today_start, _) = crate::commands::local_day_bounds();
                state.conn().and_then(|c| startup_sweep(&c, now, today_start))
            };
            match sweep {
                Ok((marked, overdue)) if marked > 0 && overdue > 0 => notify(
                    &app,
                    "Checklist",
                    &format!("You have {overdue} overdue task{}", if overdue == 1 { "" } else { "s" }),
                ),
                Ok(_) => {}
                Err(e) => eprintln!("reminder startup sweep failed: {e}"),
            }
            loop {
                if let Err(e) = run_once(&app) {
                    eprintln!("reminder check failed: {e}");
                }
                std::thread::sleep(TICK);
            }
        })
        .expect("failed to start reminder thread");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::mem;
    use crate::db::*;

    const MIN: i64 = 60_000;

    #[test]
    fn heads_up_then_due_fire_once_each() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let it = create_item(&conn, inbox, None, "Call mom").unwrap();
        let due = 100 * MIN;
        set_item_due(&conn, it.id, Some(due), false, Some(5)).unwrap();

        assert!(collect(&conn, due - 6 * MIN).unwrap().is_empty());
        let r = collect(&conn, due - 5 * MIN).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].kind, Kind::HeadsUp(5));
        assert!(collect(&conn, due - 4 * MIN).unwrap().is_empty()); // not again
        let r = collect(&conn, due).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].kind, Kind::Due);
        assert!(collect(&conn, due + MIN).unwrap().is_empty());
    }

    #[test]
    fn late_heads_up_is_skipped_and_completed_or_allday_never_fire() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let a = create_item(&conn, inbox, None, "a").unwrap();
        set_item_due(&conn, a.id, Some(10 * MIN), false, Some(15)).unwrap();
        let r = collect(&conn, 11 * MIN).unwrap(); // both thresholds already passed
        assert_eq!(r.iter().map(|x| x.kind.clone()).collect::<Vec<_>>(), vec![Kind::Due]);

        let b = create_item(&conn, inbox, None, "b").unwrap();
        set_item_due(&conn, b.id, Some(10 * MIN), false, None).unwrap();
        set_item_completed(&conn, b.id, true).unwrap();
        let c = create_item(&conn, inbox, None, "c").unwrap();
        set_item_due(&conn, c.id, Some(0), true, None).unwrap();
        assert!(collect(&conn, 20 * MIN).unwrap().is_empty());
    }

    #[test]
    fn rescheduling_fires_again() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let a = create_item(&conn, inbox, None, "a").unwrap();
        set_item_due(&conn, a.id, Some(10 * MIN), false, None).unwrap();
        assert_eq!(collect(&conn, 10 * MIN).unwrap().len(), 1);
        set_item_due(&conn, a.id, Some(20 * MIN), false, None).unwrap();
        assert_eq!(collect(&conn, 20 * MIN).unwrap().len(), 1);
    }

    #[test]
    fn startup_sweep_marks_only_stale() {
        let conn = mem();
        let inbox = inbox_id(&conn).unwrap();
        let now = 1_000 * MIN;
        let old = create_item(&conn, inbox, None, "old").unwrap();
        set_item_due(&conn, old.id, Some(now - 120 * MIN), false, Some(5)).unwrap();
        let recent = create_item(&conn, inbox, None, "recent").unwrap();
        set_item_due(&conn, recent.id, Some(now - 10 * MIN), false, None).unwrap();

        let (marked, overdue) = startup_sweep(&conn, now, now - 600 * MIN).unwrap();
        assert_eq!((marked, overdue), (1, 2));
        // The stale one stays quiet; the recent one still gets its notification.
        let fired = collect(&conn, now).unwrap();
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].title, "recent");
    }
}
