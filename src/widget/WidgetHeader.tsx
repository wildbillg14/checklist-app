import { useState } from "react";
import * as api from "../shared/api";
import type { Settings } from "../shared/types";

interface Props {
  settings: Settings;
  count: number;
  overdue: number;
}

/** Drag region + pin, opacity, collapse and expand-to-main controls. */
export default function WidgetHeader({ settings, count, overdue }: Props) {
  const [showOpacity, setShowOpacity] = useState(false);
  const collapsed = settings.widgetCollapsed;

  return (
    <div className="shrink-0">
      <header
        data-tauri-drag-region
        className="flex h-10 cursor-default items-center gap-1 border-b border-black/10 pl-3 pr-1.5 dark:border-white/10"
      >
        <span data-tauri-drag-region className="flex-1 truncate text-sm font-semibold">
          Today
          <span data-tauri-drag-region className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {count}
          </span>
          {overdue > 0 && (
            <span
              data-tauri-drag-region
              className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[11px] font-medium text-white"
              title={`${overdue} overdue`}
            >
              {overdue}
            </span>
          )}
        </span>
        <HeaderButton
          title={settings.widgetPinned ? "Unpin (stop staying on top)" : "Pin on top"}
          active={settings.widgetPinned}
          onClick={() => void api.setPinned(!settings.widgetPinned)}
          data-pin
        >
          <span className={settings.widgetPinned ? "" : "opacity-50 grayscale"}>📌</span>
        </HeaderButton>
        <HeaderButton title="Opacity" active={showOpacity} onClick={() => setShowOpacity((v) => !v)}>
          ◐
        </HeaderButton>
        <HeaderButton
          title={collapsed ? "Expand list" : "Collapse to title bar"}
          onClick={() => void api.setWidgetCollapsed(!collapsed)}
          data-collapse
        >
          {collapsed ? "▾" : "▴"}
        </HeaderButton>
        <HeaderButton title={`Open full window (${settings.toggleHotkey})`} onClick={() => void api.toggleMode()} data-expand>
          ⤢
        </HeaderButton>
      </header>
      {showOpacity && !collapsed && (
        <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
          <span className="text-zinc-500 dark:text-zinc-400">Opacity</span>
          <input
            type="range"
            min={30}
            max={100}
            value={settings.widgetOpacity}
            aria-label="Widget opacity"
            onChange={(e) => void api.setSetting("widgetOpacity", Number(e.target.value))}
            className="flex-1 accent-sky-500"
          />
          <span className="w-9 text-right tabular-nums">{settings.widgetOpacity}%</span>
        </div>
      )}
    </div>
  );
}

function HeaderButton({
  children,
  title,
  onClick,
  active = false,
  ...rest
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
} & Record<`data-${string}`, boolean>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      {...rest}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-black/10 dark:hover:bg-white/15 ${
        active ? "bg-black/10 dark:bg-white/15" : ""
      }`}
    >
      {children}
    </button>
  );
}
