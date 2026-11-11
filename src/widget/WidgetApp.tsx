import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../shared/api";
import Background from "../shared/Background";
import Toasts from "../shared/Toasts";
import { useTheme } from "../shared/theme";
import { DEFAULT_SETTINGS, type Settings, type TodayView } from "../shared/types";
import { useDataChanged } from "../shared/useDataChanged";
import QuickAdd from "./QuickAdd";
import TodayList from "./TodayList";
import WidgetHeader from "./WidgetHeader";

/** Mini view: today's incomplete tasks, quick add, pin/opacity/collapse. */
export default function WidgetApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [today, setToday] = useState<TodayView>({ overdue: [], today: [] });
  const [focusTick, setFocusTick] = useState(0);
  const dark = useTheme(settings.theme);

  const loadSettings = useCallback(async () => {
    const stored = await api.getSettings();
    setSettings({ ...DEFAULT_SETTINGS, ...stored });
  }, []);
  const loadToday = useCallback(async () => setToday(await api.getToday()), []);

  useEffect(() => {
    void loadSettings();
    void loadToday();
    const t = window.setInterval(() => void loadToday(), 60_000);
    return () => window.clearInterval(t);
  }, [loadSettings, loadToday]);

  useDataChanged((scope) => void (scope === "settings" ? loadSettings() : loadToday()));

  // Tray "Quick add" asks the widget to focus its input.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen("focus-quick-add", () => setFocusTick((n) => n + 1)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Refresh when shown again (data may have changed while hidden).
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && void loadToday();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadToday]);

  const alpha = settings.widgetOpacity / 100;
  const collapsed = settings.widgetCollapsed;
  const count = today.overdue.length + today.today.length;

  return (
    <div
      className={`relative flex h-screen flex-col overflow-hidden rounded-xl border text-zinc-900 dark:text-zinc-100 ${
        dark ? "border-white/15" : "border-black/15"
      }`}
      style={{ backgroundColor: dark ? `rgba(24, 24, 27, ${alpha})` : `rgba(250, 250, 250, ${alpha})` }}
    >
      {/* Background layer fades with the opacity slider; text stays fully opaque. */}
      <Background
        background={settings.background}
        dim={settings.bgDim}
        blur={settings.bgBlur}
        dark={dark}
        subtle
        contained
        opacity={alpha}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <WidgetHeader settings={settings} count={count} overdue={today.overdue.length} />
        {!collapsed && (
          <>
            <TodayList today={today} />
            <QuickAdd focusTick={focusTick} />
          </>
        )}
      </div>
      <Toasts />
    </div>
  );
}
