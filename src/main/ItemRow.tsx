import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as api from "../shared/api";
import { useStore } from "../shared/store";
import type { Item } from "../shared/types";
import InlineEdit from "./InlineEdit";
import { IconButton } from "./Sidebar";

interface Props {
  item: Item;
  sortable?: boolean;
}

export default function ItemRow({ item, sortable = false }: Props) {
  const s = useSortable({ id: item.id, disabled: !sortable });
  const style = sortable
    ? { transform: CSS.Transform.toString(s.transform), transition: s.transition, opacity: s.isDragging ? 0.6 : 1 }
    : undefined;

  return (
    <li ref={s.setNodeRef} style={style} className="list-none" data-item-id={item.id}>
      <RowBody item={item} dragProps={sortable ? { ...s.attributes, ...s.listeners } : undefined} />
    </li>
  );
}

function RowBody({ item, dragProps }: { item: Item; dragProps?: Record<string, unknown> }) {
  const selected = useStore((s) => s.selectedItemId === item.id);
  const selectItem = useStore((s) => s.selectItem);
  const lists = useStore((s) => s.lists);
  const [editing, setEditing] = useState(false);
  const done = item.completedAt !== null;
  const moveTargets = lists.filter((l) => l.id !== item.listId && l.isTemplate === isTemplateList(lists, item.listId));

  return (
    <div
      onClick={() => selectItem(item.id)}
      onDoubleClick={() => setEditing(true)}
      className={`group relative flex items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 text-sm shadow-sm transition-colors ${
        selected
          ? "border-sky-400 bg-white dark:bg-zinc-800"
          : "border-black/5 bg-white/85 hover:bg-white dark:border-white/5 dark:bg-zinc-900/75 dark:hover:bg-zinc-900"
      }`}
    >
      <span
        {...dragProps}
        title="Drag to reorder"
        className={`cursor-grab select-none px-0.5 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 ${dragProps ? "" : "invisible"}`}
      >
        ⋮⋮
      </span>
      <input
        type="checkbox"
        checked={done}
        onChange={() => void api.setItemCompleted(item.id, !done)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
        aria-label={done ? "Mark as not done" : "Mark as done"}
      />
      {editing ? (
        <InlineEdit
          value={item.title}
          className="flex-1"
          onSave={(v) => {
            setEditing(false);
            void api.renameItem(item.id, v);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <span className={`flex-1 truncate ${done ? "text-zinc-400 line-through dark:text-zinc-500" : ""}`}>
          {item.title}
        </span>
      )}

      {!editing && (
        <span className="hidden items-center gap-0.5 group-hover:flex">
          {moveTargets.length > 0 && (
            <select
              title="Move to another list"
              value=""
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const target = Number(e.target.value);
                if (target) void api.moveItem(item.id, target);
              }}
              className="max-w-24 rounded bg-transparent text-xs text-zinc-500 outline-none hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
            >
              <option value="">Move…</option>
              {moveTargets.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <IconButton title="Rename" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>✎</IconButton>
          <IconButton title="Delete (Del)" onClick={(e) => { e.stopPropagation(); void api.deleteItem(item.id); }}>✕</IconButton>
        </span>
      )}
    </div>
  );
}

function isTemplateList(lists: { id: number; isTemplate: boolean }[], id: number): boolean {
  return lists.find((l) => l.id === id)?.isTemplate ?? false;
}
