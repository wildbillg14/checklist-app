import { create } from "zustand";
import * as api from "./api";
import {
  DEFAULT_SETTINGS,
  type Item,
  type ItemWithContext,
  type List,
  type SettingKey,
  type Settings,
  type TodayView,
} from "./types";

export type View = { kind: "list"; listId: number } | { kind: "today" };

export interface NamePrompt {
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  resolve: (name: string | null) => void;
}

interface AppState {
  loaded: boolean;
  lists: List[];
  /** Items of the list currently shown (top-level and sub-items). */
  items: Item[];
  today: TodayView;
  view: View | null;
  selectedItemId: number | null;
  /** Parents whose sub-items are collapsed (session only). */
  collapsed: Record<number, true>;
  /** Item to scroll into view once it is rendered (after a search jump). */
  pendingScrollId: number | null;
  settings: Settings;
  /** Sidebar is showing the "new list" input (Ctrl+N). */
  creatingList: boolean;
  creatingTemplate: boolean;
  searchOpen: boolean;
  namePrompt: NamePrompt | null;

  init: () => Promise<void>;
  refreshData: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setView: (view: View) => void;
  selectItem: (id: number | null) => void;
  toggleCollapsed: (parentId: number, collapsed?: boolean) => void;
  jumpToItem: (item: ItemWithContext) => void;
  clearPendingScroll: () => void;
  /** Optimistically replace local items (used by drag reorder). */
  setItemsLocal: (items: Item[]) => void;
  setListsLocal: (lists: List[]) => void;
  updateSetting: <K extends SettingKey>(key: K, value: Settings[K]) => Promise<void>;
  setCreatingList: (v: boolean) => void;
  setCreatingTemplate: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  /** Show the name dialog; resolves with the name, or null if cancelled. */
  askName: (opts: Omit<NamePrompt, "resolve">) => Promise<string | null>;
}

export const useStore = create<AppState>((set, get) => ({
  loaded: false,
  lists: [],
  items: [],
  today: { overdue: [], today: [] },
  view: null,
  selectedItemId: null,
  collapsed: {},
  pendingScrollId: null,
  settings: DEFAULT_SETTINGS,
  creatingList: false,
  creatingTemplate: false,
  searchOpen: false,
  namePrompt: null,

  init: async () => {
    await Promise.all([get().refreshSettings(), get().refreshData()]);
    set({ loaded: true });
  },

  refreshData: async () => {
    const [lists, today] = await Promise.all([api.getLists(), api.getToday()]);
    let view = get().view;
    // Fall back to the Inbox if nothing is selected or the list was deleted.
    if (!view || (view.kind === "list" && !lists.some((l) => l.id === (view as { listId: number }).listId))) {
      const inbox = lists.find((l) => l.isInbox) ?? lists[0];
      view = inbox ? { kind: "list", listId: inbox.id } : null;
    }
    const items = view?.kind === "list" ? await api.getItems(view.listId) : [];
    const selected = get().selectedItemId;
    const visibleIds = new Set(
      view?.kind === "today" ? [...today.overdue, ...today.today].map((i) => i.id) : items.map((i) => i.id),
    );
    set({
      lists,
      today,
      view,
      items,
      selectedItemId: selected !== null && visibleIds.has(selected) ? selected : null,
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

  toggleCollapsed: (parentId, collapsed) => {
    const next = { ...get().collapsed };
    const shouldCollapse = collapsed ?? !next[parentId];
    if (shouldCollapse) next[parentId] = true;
    else delete next[parentId];
    set({ collapsed: next });
  },

  jumpToItem: (item) => {
    if (item.parentId !== null) get().toggleCollapsed(item.parentId, false);
    // Completed items would be invisible with "hide completed" on.
    if (item.completedAt !== null && !get().settings.showCompleted) void get().updateSetting("showCompleted", true);
    set({ view: { kind: "list", listId: item.listId }, selectedItemId: item.id, pendingScrollId: item.id, searchOpen: false });
    void get().refreshData().then(() => set({ selectedItemId: item.id }));
  },

  clearPendingScroll: () => set({ pendingScrollId: null }),
  setItemsLocal: (items) => set({ items }),
  setListsLocal: (lists) => set({ lists }),

  updateSetting: async (key, value) => {
    set({ settings: { ...get().settings, [key]: value } });
    await api.setSetting(key, value);
  },

  setCreatingList: (v) => set({ creatingList: v }),
  setCreatingTemplate: (v) => set({ creatingTemplate: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),

  askName: (opts) =>
    new Promise((resolve) => {
      set({
        namePrompt: {
          ...opts,
          resolve: (name) => {
            set({ namePrompt: null });
            resolve(name);
          },
        },
      });
    }),
}));

export const useCurrentList = (): List | undefined =>
  useStore((s) => (s.view?.kind === "list" ? s.lists.find((l) => l.id === (s.view as { listId: number }).listId) : undefined));
