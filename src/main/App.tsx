import { useEffect, useState } from "react";
import { useStore } from "../shared/store";
import { useDataChanged } from "../shared/useDataChanged";
import { useTheme } from "../shared/theme";
import Background from "../shared/Background";
import Toasts from "../shared/Toasts";
import Sidebar from "./Sidebar";
import ListView from "./ListView";
import DueTodayView from "./DueTodayView";
import ItemEditor from "./ItemEditor";
import SearchBar from "./SearchBar";
import Settings from "./Settings";
import TemplateDialog from "./TemplateDialog";
import { useShortcuts } from "./shortcuts";

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const viewKind = useStore((s) => s.view?.kind);
  const settings = useStore((s) => s.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dark = useTheme(settings.theme);

  useEffect(() => {
    void useStore.getState().init();
    // Overdue status changes with time: refresh once a minute.
    const t = window.setInterval(() => void useStore.getState().refreshData(), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useDataChanged((scope) => {
    const s = useStore.getState();
    void (scope === "settings" ? s.refreshSettings() : s.refreshData());
  });

  useShortcuts(settingsOpen);

  return (
    <div className="relative isolate flex h-screen text-zinc-900 dark:text-zinc-100">
      {loaded && (
        <>
          <Background background={settings.background} dim={settings.bgDim} blur={settings.bgBlur} dark={dark} />
          <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
          {viewKind === "today" ? <DueTodayView /> : <ListView />}
          {viewKind === "list" && <ItemEditor />}
        </>
      )}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      <SearchBar />
      <TemplateDialog />
      <Toasts />
    </div>
  );
}
