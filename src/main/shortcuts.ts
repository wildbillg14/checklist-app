import { useEffect } from "react";
import { useStore } from "../shared/store";

/** Window-level keyboard shortcuts for the main window. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useStore.getState().selectItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
