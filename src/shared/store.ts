import { create } from "zustand";
import * as api from "./api";
import { DEFAULT_SETTINGS, type Item, type List, type SettingKey, type Settings } from "./types";

export type View = { kind: "list"; listId: number };

interface AppState {
  loaded: boolean;
  lists: List[];
  /** Items of the list currently shown (top-level and sub-items). */
  items: Item[];
  view: View | null;
  selectedItemId: number | null;
  settings: Settings;
  /** Sidebar is showing the "new list" input (Ctrl+N). */
  creatingList: boolean;

  init: () => Promise<void>;
  setCreatingList: (v: boolean) => void;
  refreshData: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setView: (view: View) => void;
  selectItem: (id: number | null) => void;
  /** Optimistically replace local items (used by drag reorder). */
  setItemsLocal: (items: Item[]) => void;
  setListsLocal: (lists: List[]) => void;
  updateSetting: <K extends SettingKey>(key: K, value: Settings[K]) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  loaded: false,
  lists: [],
  items: [],
  view: null,
  selectedItemId: null,
  settings: DEFAULT_SETTINGS,
  creatingList: false,

  setCreatingList: (v) => set({ creatingList: v }),

  init: async () => {
    await Promise.all([get().refreshSettings(), get().refreshData()]);
    set({ loaded: true });
  },

  refreshData: async () => {
    const lists = await api.getLists();
    let view = get().view;
    // Fall back to the Inbox if nothing is selected or the list was deleted.
    if (!view || !lists.some((l) => l.id === view?.listId)) {
      const inbox = lists.find((l) => l.isInbox) ?? lists[0];
      view = inbox ? { kind: "list", listId: inbox.id } : null;
    }
    const items = view ? await api.getItems(view.listId) : [];
    const selected = get().selectedItemId;
    set({
      lists,
      view,
      items,
      selectedItemId: selected !== null && items.some((i) => i.id === selected) ? selected : null,
    });
  },

  refreshSettings: async () => {
    const stored = await api.getSettings();
    set({ settings: { ...DEFAULT_SETTINGS, ...stored } });
  },

  setView: (view) => {
    set({ view, selectedItemId: null, items: [] });
    void get().refreshData();
  },

  selectItem: (id) => set({ selectedItemId: id }),
  setItemsLocal: (items) => set({ items }),
  setListsLocal: (lists) => set({ lists }),

  updateSetting: async (key, value) => {
    set({ settings: { ...get().settings, [key]: value } });
    await api.setSetting(key, value);
  },
}));

export const useCurrentList = (): List | undefined =>
  useStore((s) => (s.view ? s.lists.find((l) => l.id === s.view?.listId) : undefined));
