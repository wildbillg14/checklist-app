import { useToasts } from "./toast";

export default function Toasts() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 flex max-w-xs flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-lg px-3 py-2 text-left text-sm shadow-lg ${
            t.kind === "error" ? "bg-red-600 text-white" : "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
