import { useEffect, useRef, useState } from "react";
import { useStore } from "../shared/store";

/**
 * Modal name prompt, driven by `useStore().askName(...)`. Used for
 * "Save as template" and "New list from template".
 */
export default function TemplateDialog() {
  const prompt = useStore((s) => s.namePrompt);
  if (!prompt) return null;
  return <Dialog key={prompt.title + prompt.initial} />;
}

function Dialog() {
  const prompt = useStore((s) => s.namePrompt)!;
  const [name, setName] = useState(prompt.initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const v = name.trim();
    if (v) prompt.resolve(v);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-32"
      onMouseDown={(e) => e.target === e.currentTarget && prompt.resolve(null)}
    >
      <form
        role="dialog"
        aria-label={prompt.title}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") prompt.resolve(null);
        }}
        className="w-96 rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
      >
        <h2 className="mb-3 text-base font-semibold">{prompt.title}</h2>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{prompt.label}</label>
        <input
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-white/15 dark:bg-zinc-800"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => prompt.resolve(null)}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          >
            {prompt.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
