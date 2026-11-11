// Types mirror the Rust structs in src-tauri/src/db.rs (serde camelCase).

export interface List {
  id: number;
  name: string;
  accentColor: string | null;
  isTemplate: boolean;
  isInbox: boolean;
  position: number;
  createdAt: number;
}

export interface Item {
  id: number;
  listId: number;
  parentId: number | null;
  title: string;
  color: string | null;
  /** Epoch ms. For all-day items this is local midnight of the due day. */
  dueAt: number | null;
  /** True when the item is due on a day with no specific time. */
  dueAllDay: boolean;
  headsUpMinutes: HeadsUpMinutes | null;
  notifiedAt: number | null;
  headsUpNotifiedAt: number | null;
  completedAt: number | null;
  position: number;
  createdAt: number;
}

export type HeadsUpMinutes = 5 | 15 | 30 | 60;
export const HEADS_UP_OPTIONS: readonly HeadsUpMinutes[] = [5, 15, 30, 60];

/** An item plus the context needed to show it outside its own list. */
export interface ItemWithContext extends Item {
  listName: string;
  listAccent: string | null;
  parentTitle: string | null;
}

export interface TodayView {
  overdue: ItemWithContext[];
  today: ItemWithContext[];
}

export type DataChangedScope = "data" | "settings";

export type Theme = "light" | "dark" | "system";
export type Mode = "main" | "widget";

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; id: string }
  | { kind: "image"; path: string };

export interface Settings {
  theme: Theme;
  background: Background;
  /** 0–80: how strongly the background is dimmed behind content. */
  bgDim: number;
  /** 0–20: background blur in px. */
  bgBlur: number;
  showCompleted: boolean;
  mode: Mode;
  widgetOpacity: number;
  widgetPinned: boolean;
  widgetCollapsed: boolean;
}

export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  background: { kind: "gradient", id: "dawn" },
  bgDim: 30,
  bgBlur: 0,
  showCompleted: true,
  mode: "main",
  widgetOpacity: 90,
  widgetPinned: false,
  widgetCollapsed: false,
};
