import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DataChangedScope } from "./types";

/** Subscribe to the backend's `data-changed` broadcast (sent after every write). */
export function useDataChanged(handler: (scope: DataChangedScope) => void): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<DataChangedScope>("data-changed", (e) => ref.current(e.payload)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
