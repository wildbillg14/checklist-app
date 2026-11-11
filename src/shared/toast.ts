import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "error" | "info";
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast["kind"], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, kind, message }].slice(-4) });
    window.setTimeout(() => get().dismiss(id), kind === "error" ? 6000 : 3000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toastError = (message: string): void => useToasts.getState().push("error", message);
export const toastInfo = (message: string): void => useToasts.getState().push("info", message);

/** Error thrown by api.ts after it has already shown a toast. */
export class ReportedError extends Error {}

// Errors already shown as a toast shouldn't also surface as unhandled rejections.
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason instanceof ReportedError) e.preventDefault();
});
