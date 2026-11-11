import { useEffect } from "react";
import { useStore } from "../shared/store";

/** Window-level keyboard shortcuts for the main window. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        s.setSearchOpen(true);
        return;
      }
      if (e.key === "Escape") s.selectItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
