# Build Prompt: Checklist Desktop App (Tauri 2)

You are building a Windows desktop checklist app in the current directory: `C:\dev\checklist-app` (currently empty). Work through the phases below in order. After each phase: run it, verify the phase's test checklist, fix anything broken, then `git commit` with a clear message before moving on. Don't stop to ask permission between phases. Only stop and ask me if you're blocked (e.g. an installer needs admin rights, a reboot, or a decision this spec doesn't cover).

---

## 0. Product summary

A personal checklist app with two modes:
- **Normal mode** (default): a regular app window with sidebar of lists, items, sub-items, templates, due dates, reminders, search, personalization.
- **Mini view**: a small floating widget showing only today's tasks. Toggled with **Ctrl+Shift+L** (global), a toolbar button, or the tray. Only one of the two windows is visible at a time.

Data is local only (SQLite on this PC). No accounts, no sync.

---

## 1. Stack (use exactly this unless something is broken, then tell me why you changed it)

| Piece | Choice |
|---|---|
| Shell | Tauri 2 (latest stable) |
| Frontend | React 18 + TypeScript + Vite, **multi-page**: `main.html` and `widget.html` |
| Styling | Tailwind CSS |
| State | Zustand |
| Drag & drop | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| Dates | date-fns |
| Database | **SQLite owned by Rust** via `rusqlite` (feature `bundled`). The frontend never touches SQL; it calls Tauri commands. |
| Tauri plugins | `notification`, `autostart`, `global-shortcut`, `window-state`, `dialog`, `single-instance` |
| Tray | Tauri built-in tray (`tray-icon` feature) |

Why Rust owns the DB: the reminder engine runs in Rust and must read the same data while both windows are hidden. One owner = one source of truth.

App identifier: `com.wildbillg14.checklist`. Product name: `Checklist`.

---

## 2. Prerequisites (Phase 1 does these)

Check each; install only what's missing. Use `winget` where possible.
1. Node.js LTS (`node -v`; need 20+)
2. Rust via rustup: `winget install Rustlang.Rustup`, then `rustup default stable-msvc`
3. Visual Studio 2022 Build Tools with the **"Desktop development with C++"** workload:
   `winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
4. WebView2 runtime (preinstalled on Windows 11; verify)
5. Git (`git -v`)

If an install needs a new terminal/reboot for PATH to update, tell me and stop.

---

## 3. Data model

SQLite file at `{app_data_dir}/checklist.db`. Enable WAL mode. Run migrations on startup with a `schema_version` in `PRAGMA user_version`.

```sql
CREATE TABLE lists (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  accent_color  TEXT,              -- hex, nullable
  is_template   INTEGER NOT NULL DEFAULT 0,
  is_inbox      INTEGER NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL   -- epoch ms
);

CREATE TABLE items (
  id                    INTEGER PRIMARY KEY,
  list_id               INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  parent_id             INTEGER REFERENCES items(id) ON DELETE CASCADE, -- NULL = top level; max depth 1
  title                 TEXT NOT NULL,
  color                 TEXT,          -- hex, nullable
  due_at                INTEGER,       -- epoch ms, nullable
  heads_up_minutes      INTEGER,       -- NULL or 5/15/30/60
  notified_at           INTEGER,
  heads_up_notified_at  INTEGER,
  completed_at          INTEGER,
  position              INTEGER NOT NULL,
  created_at            INTEGER NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); -- JSON values
```

- Seed one list named **Inbox** with `is_inbox = 1`. Inbox can't be deleted or renamed or turned into a template.
- Sub-items: enforce depth 1 in the Rust command (reject a parent that itself has a parent).
- Changing `due_at` or `heads_up_minutes` resets `notified_at` / `heads_up_notified_at` to NULL.
- "Today" is computed in **local time**.

### Commands
Expose typed Tauri commands for all CRUD (lists, items, reorder, move item to another list, complete/uncomplete, clear completed, create list from template, save list as template, search, get today view, get/set settings). After any write, **emit a `data-changed` event to all windows** so the main window and widget stay in sync. Put TS wrappers + types in `src/shared/api.ts` and `src/shared/types.ts`.

---

## 4. Folder structure

```
src/
  main/      App.tsx, Sidebar, ListView, ItemRow, SubItems, TemplateDialog, SearchBar, Settings, DueTodayView
  widget/    WidgetApp.tsx, TodayList, QuickAdd, WidgetHeader (pin, opacity, expand)
  shared/    api.ts, types.ts, store.ts, colors.ts, dates.ts, useDataChanged.ts
  styles/    index.css
main.html
widget.html
src-tauri/
  src/  main.rs, lib.rs, db.rs, commands.rs, reminders.rs, tray.rs, windows.rs
  capabilities/  default.json   (Tauri 2 permissions for every plugin/API used, for BOTH windows)
  tauri.conf.json
```

---

## 5. Phases

### Phase 1 — Prerequisites + scaffold
- Install prerequisites (section 2).
- Scaffold with `npm create tauri-app@latest` (React + TypeScript + npm) into the current folder; rename/restructure to match section 4. Configure Vite multi-page (`main.html`, `widget.html`).
- Add Tailwind, Zustand, dnd-kit, date-fns. `git init`, add a proper `.gitignore` (node_modules, dist, src-tauri/target).
- **Test:** `npm run tauri dev` opens a window that renders "Checklist".

### Phase 2 — Database + core lists/items
- `db.rs` (connection in `Mutex` in Tauri state, migrations, Inbox seed), `commands.rs`.
- Main window: sidebar of lists (create, rename, delete with confirm, drag to reorder; Inbox pinned at top), list view with items (add, inline edit, check off, delete, drag to reorder, move to another list).
- Show/hide completed toggle, "Clear completed" button. Auto-save on every change (no save button).
- **Test:** create lists and items, reorder, restart app; everything persists in the same order.

### Phase 3 — Sub-items, templates, search, Due today
- Sub-items one level deep, collapsible, parent shows "3/5" progress.
- Templates: separate sidebar section. "Save as template" (copies list + items, unchecked, without due dates), "New template", "New list from template" (fresh unchecked copy, prompts for name).
- Search (Ctrl+F) across all non-template lists, results jump to the item.
- "Due today" view at the top of the sidebar: incomplete items due today + overdue (overdue section on top), from all lists.
- **Test:** template round-trip; sub-item progress updates; search finds sub-items too.

### Phase 4 — Personality
- Per-task color: 8 preset swatches + custom color picker; shown as a left color bar / dot on the row. Per-list accent color in the sidebar.
- Background: Settings lets me choose solid color, one of ~6 preset gradients, or **my own image** (pick with `dialog` plugin → Rust copies it into `{app_data_dir}/backgrounds/` → load via `convertFileSrc`; enable the asset protocol scoped to that folder only, and set a CSP that allows it). Dim/blur slider so text stays readable.
- Theme: light / dark / system.
- Keyboard shortcuts: Enter add item, Ctrl+N new list, Ctrl+F search, Delete removes selected item, Esc cancels edit.
- **Test:** custom image background persists across restart; text readable in light and dark.

### Phase 5 — Due dates + reminders
- Item editor: optional due date + time; optional early heads-up (none / 5 / 15 / 30 / 60 min before). Default = notify at due time only.
- Overdue items styled distinctly.
- `reminders.rs`: background thread/async task, checks every 30 s: fire a notification for items where `due_at <= now AND notified_at IS NULL AND completed_at IS NULL`, and heads-ups where `due_at - heads_up_minutes <= now AND heads_up_notified_at IS NULL`; set the timestamps. On startup, don't spam: items overdue by more than 1 hour get marked notified silently (one summary notification: "You have N overdue tasks").
- Note: in dev, Windows toasts may show as from PowerShell; that's expected. Verify properly in the installed build (Phase 8).
- **Test:** item due in 2 min with 1-min heads-up → two notifications, with both windows hidden.

### Phase 6 — Tray, close-to-tray, autostart, single instance
- Closing either window **hides** it (intercept `CloseRequested`); the app keeps running in the tray. Only "Quit" exits.
- Tray menu: **Open**, **Mini view** (toggle), **Quick add** (opens mini view with the quick-add input focused), **Pin on top** (checkbox, synced with the widget's pin), **Quit**. Left-click tray icon = show the window for the current mode.
- Settings toggle "Launch on Windows startup" (`autostart` plugin, pass `--minimized` so it starts hidden in tray).
- `single-instance`: launching again just focuses the existing app.
- **Test:** close window → still in tray → reminders still fire → Quit exits fully.

### Phase 7 — Mini view (widget)
Window `widget` in tauri.conf: frameless (`decorations: false`), `transparent: true`, `skipTaskbar: true`, `resizable: true`, starts hidden, ~320×420 default.
- **Toggle** (Ctrl+Shift+L global shortcut, ⤡ button in main toolbar, tray item): hide main → show widget; ⤢ button on widget (or hotkey again) → hide widget → show main exactly where it was. Never both visible.
- **Content:** today's incomplete tasks from all lists, overdue pinned on top (red marker), then by due time, then untimed. Check off directly. Each row shows the task color.
- **Quick add:** only a name + optional time today. No sub-items, no other dates, no list picker. New tasks go to **Inbox**.
- **Header:** drag region (`data-tauri-drag-region`), 📌 pin toggle (`setAlwaysOnTop`), opacity slider (applies to the widget's background alpha, 30–100%, text stays fully opaque), collapse to title bar, ⤢ expand.
- Persist via `window-state` + settings: current mode, widget position/size, pin state, opacity, collapsed state. On launch, open in the last-used mode.
- Widget follows the theme and uses a subtle version of the chosen background.
- **Test:** toggle repeatedly with hotkey from another app (e.g. Chrome focused); pin keeps it above Chrome; unpinned it goes behind; quick-add task appears in Inbox in main view instantly.

### Phase 8 — Polish + installer
- App icon (simple checkmark design; generate with `npm run tauri icon`).
- Empty states, error toasts for failed commands, no console errors.
- `npm run tauri build`. Report the installer paths (.msi and NSIS .exe).
- Install it, then re-run the key tests: notifications show as "Checklist", autostart works, tray works.

---

## 6. Rules
- TypeScript strict mode. No `any` in shared types.
- Every Tauri 2 API/plugin used must be allowed in `capabilities/default.json` for the right window(s). If something silently fails, check permissions first.
- Keep Rust commands small; return `Result<T, String>` with useful error messages.
- Commit after each phase. Don't push anywhere unless I ask.
- **Out of scope (don't build):** recurring templates, export, cloud sync, tags/priorities, Mac build, auto-updater.

## 7. When you finish
Give me: a short summary of what was built, anything you changed from this spec and why, the installer path, and a 10-step manual test I can run myself.
