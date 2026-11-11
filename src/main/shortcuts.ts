import { useEffect, useRef } from "react";
import * as api from "../shared/api";
import { useStore } from "../shared/store";
import { ADD_ITEM_INPUT_ID } from "./ListView";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Main-window keyboard shortcuts:
 * Enter = add task (focus the add box), Ctrl+N = new list, Ctrl+F = search,
 * Delete = remove the selected task, Esc = cancel / deselect.
 * (Inline editors stop propagation, so Esc there only cancels the edit.)
 */
export function useShortcuts(modalOpen: boolean): void {
  const modalRef = useRef(modalOpen);
  modalRef.current = modalOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const blocked = modalRef.current || s.searchOpen || s.namePrompt !== null;
      const key = e.key.toLowerCase();

      if (e.ctrlKey && !e.shiftKey && !e.altKey && key === "f") {
        e.preventDefault();
        if (!blocked) s.setSearchOpen(true);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && key === "n") {
        e.preventDefault();
        if (!blocked) s.setCreatingList(true);
        return;
      }
      if (blocked || isTyping(e.target)) return;

      if (e.key === "Enter") {
        const input = document.getElementById(ADD_ITEM_INPUT_ID);
        if (input) {
          e.preventDefault();
          input.focus();
        }
      } else if (e.key === "Delete" && s.selectedItemId !== null) {
        e.preventDefault();
        void api.deleteItem(s.selectedItemId);
      } else if (e.key === "Escape") {
        s.selectItem(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
