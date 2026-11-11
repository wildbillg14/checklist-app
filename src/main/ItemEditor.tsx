import { useEffect, useState } from "react";
import { format } from "date-fns";
import * as api from "../shared/api";
import { useStore } from "../shared/store";
import type { Item } from "../shared/types";
import ColorPicker from "./ColorPicker";

/** Right-hand panel for the selected item: title, color, list. */
export default function ItemEditor() {
  const item = useStore((s) => s.items.find((i) => i.id === s.selectedItemId));
  if (!item) return null;
  return <Editor key={item.id} item={item} />;
}

function Editor({ item }: { item: Item }) {
  const lists = useStore((s) => s.lists);
  const selectItem = useStore((s) => s.selectItem);
  const [title, setTitle] = useState(item.title);
  useEffect(() => setTitle(item.title), [item.title]);

  const ownIsTemplate = lists.find((l) => l.id === item.listId)?.isTemplate ?? false;
  const listOptions = lists.filter((l) => l.isTemplate === ownIsTemplate);

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== item.title) void api.renameItem(item.id, t);
    else setTitle(item.title);
  };

  return (
    <aside
      aria-label="Task details"
      className="panel flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-black/5 p-4 dark:border-white/5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Task</h2>
        <button
          type="button"
          onClick={() => selectItem(null)}
          aria-label="Close details"
          title="Close (Esc)"
          className="rounded px-1.5 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          ✕
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTitle(item.title);
            e.currentTarget.blur();
          }
        }}
        aria-label="Task title"
        className="w-full rounded-md border border-black/10 bg-white/80 px-2 py-1.5 text-sm font-medium outline-none focus:border-sky-400 dark:border-white/10 dark:bg-zinc-800/80"
      />

      <Field label="Color">
        <ColorPicker value={item.color} onChange={(c) => void api.setItemColor(item.id, c)} />
      </Field>

      <Field label="List">
        <select
          value={item.parentId === null ? item.listId : ""}
          onChange={(e) => {
            const target = Number(e.target.value);
            if (target) void api.moveItem(item.id, target);
          }}
          aria-label="List"
          className="w-full rounded-md border border-black/10 bg-white/80 px-2 py-1.5 text-sm outline-none dark:border-white/10 dark:bg-zinc-800/80"
        >
          {item.parentId !== null && <option value="">(sub-item) — move to…</option>}
          {listOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="mt-auto flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>Created {format(item.createdAt, "MMM d, yyyy")}</span>
        <button
          type="button"
          onClick={() => void api.deleteItem(item.id)}
          className="rounded px-2 py-1 font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete task
        </button>
      </div>
    </aside>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      {children}
    </div>
  );
}
