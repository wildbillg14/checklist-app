import { useEffect } from "react";
import { useStore } from "../shared/store";
import { useDataChanged } from "../shared/useDataChanged";
import Toasts from "../shared/Toasts";
import Sidebar from "./Sidebar";
import ListView from "./ListView";
import { useShortcuts } from "./shortcuts";

export default function App() {
  const loaded = useStore((s) => s.loaded);

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
          <ListView />
        </>
      )}
      <Toasts />
    </div>
  );
}
