import { useEffect } from "react";
import { useStore } from "../shared/store";
import { useDataChanged } from "../shared/useDataChanged";
import Toasts from "../shared/Toasts";
import Sidebar from "./Sidebar";
import ListView from "./ListView";
import DueTodayView from "./DueTodayView";
import SearchBar from "./SearchBar";
import TemplateDialog from "./TemplateDialog";
import { useShortcuts } from "./shortcuts";

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const viewKind = useStore((s) => s.view?.kind);

  useEffect(() => {
    void useStore.getState().init();
  }, []);

  useDataChanged((scope) => {
    const s = useStore.getState();
    void (scope === "settings" ? s.refreshSettings() : s.refreshData());
  });

  useShortcuts();

  return (
    <div className="flex h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {loaded && (
        <>
          <Sidebar />
          {viewKind === "today" ? <DueTodayView /> : <ListView />}
        </>
      )}
      <SearchBar />
      <TemplateDialog />
      <Toasts />
    </div>
  );
}
