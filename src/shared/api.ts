// Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
// The frontend never touches SQL. Failed commands show an error toast and
// throw a ReportedError (which is silenced if left unhandled).

import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { ReportedError, toastError } from "./toast";
import type { Item, List, SettingKey, Settings } from "./types";

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

// Settings
export const getSettings = () => call<Partial<Settings>>("get_settings");
export const setSetting = <K extends SettingKey>(key: K, value: Settings[K]) =>
  call<void>("set_setting", { key, value });
