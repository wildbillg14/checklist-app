// Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
// The frontend never touches SQL. Failed commands show an error toast and
// throw a ReportedError (which is silenced if left unhandled).

import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { ReportedError, toastError } from "./toast";
import type {
  HeadsUpMinutes,
  HotkeyInfo,
  Item,
  ItemWithContext,
  List,
  Mode,
  SettingKey,
  Settings,
  TodayView,
} from "./types";

async function call<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const message = typeof e === "string" ? e : e instanceof Error ? e.message : `Command ${cmd} failed`;
    toastError(message);
    throw new ReportedError(message);
  }
}

// Lists
export const getLists = () => call<List[]>("get_lists");
export const createList = (name: string, isTemplate = false) =>
  call<List>("create_list", { name, isTemplate });
export const renameList = (id: number, name: string) => call<void>("rename_list", { id, name });
export const setListAccent = (id: number, color: string | null) =>
  call<void>("set_list_accent", { id, color });
export const deleteList = (id: number) => call<void>("delete_list", { id });
export const reorderLists = (ids: number[]) => call<void>("reorder_lists", { ids });

// Items
export const getItems = (listId: number) => call<Item[]>("get_items", { listId });
export const createItem = (listId: number, title: string, parentId: number | null = null) =>
  call<Item>("create_item", { listId, parentId, title });
export const renameItem = (id: number, title: string) => call<void>("rename_item", { id, title });
export const setItemColor = (id: number, color: string | null) =>
  call<void>("set_item_color", { id, color });
export const setItemCompleted = (id: number, completed: boolean) =>
  call<void>("set_item_completed", { id, completed });
export const deleteItem = (id: number) => call<void>("delete_item", { id });
export const reorderItems = (ids: number[]) => call<void>("reorder_items", { ids });
export const moveItem = (id: number, listId: number) => call<void>("move_item", { id, listId });
export const clearCompleted = (listId: number) => call<number>("clear_completed", { listId });
export const setItemDue = (
  id: number,
  dueAt: number | null,
  allDay: boolean,
  headsUpMinutes: HeadsUpMinutes | null,
) => call<void>("set_item_due", { id, dueAt, allDay, headsUpMinutes });

// Templates
export const saveListAsTemplate = (listId: number, name: string) =>
  call<List>("save_list_as_template", { listId, name });
export const createListFromTemplate = (templateId: number, name: string) =>
  call<List>("create_list_from_template", { templateId, name });

// Cross-list views
export const search = (query: string) => call<ItemWithContext[]>("search", { query });
export const getToday = () => call<TodayView>("get_today");

// Mini view: quick-add goes to the Inbox, due today (at `dueAt` if a time was given, else all day).
export const quickAdd = (title: string, dueAt: number | null) => call<Item>("quick_add", { title, dueAt });

// Windows / modes (implemented in Rust so the tray and hotkey stay in sync)
export const toggleMode = () => call<Mode>("toggle_mode");
export const setPinned = (pinned: boolean) => call<void>("set_pinned", { pinned });
export const setWidgetCollapsed = (collapsed: boolean) => call<void>("set_widget_collapsed", { collapsed });

// Mini view hotkey
export const getHotkey = () => call<HotkeyInfo>("get_hotkey");
export const pauseHotkey = (paused: boolean) => call<HotkeyInfo>("pause_hotkey", { paused });
/** Like the others, but returns the error instead of toasting (Settings shows it inline). */
export async function trySetHotkey(combo: string): Promise<{ ok: true; info: HotkeyInfo } | { ok: false; error: string }> {
  try {
    return { ok: true, info: await invoke<HotkeyInfo>("set_hotkey", { combo }) };
  } catch (e) {
    return { ok: false, error: typeof e === "string" ? e : String(e) };
  }
}

// Background image: copies the picked file into {app_data_dir}/backgrounds and returns the new path.
export const importBackground = (source: string) => call<string>("import_background", { source });

// Settings
export const getSettings = () => call<Partial<Settings>>("get_settings");
export const setSetting = <K extends SettingKey>(key: K, value: Settings[K]) =>
  call<void>("set_setting", { key, value });
