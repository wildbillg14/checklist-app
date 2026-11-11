import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as api from "../shared/api";
import { useStore } from "../shared/store";
import type { Item } from "../shared/types";
import InlineEdit from "./InlineEdit";
import { IconButton } from "./ui";
import SubItems from "./SubItems";

interface Props {
  item: Item;
  /** Sub-items of this (top-level) item, in order. */
  subItems?: Item[];
  sortable?: boolean;
}

/** A top-level item row, with its collapsible sub-items underneath. */
export default function ItemRow({ item, subItems = [], sortable = false }: Props) {
  const s = useSortable({ id: item.id, disabled: !sortable });
  const collapsed = useStore((st) => !!st.collapsed[item.id]);
  const toggleCollapsed = useStore((st) => st.toggleCollapsed);
  const [addingSub, setAddingSub] = useState(false);
  const style = sortable
    ? { transform: CSS.Transform.toString(s.transform), transition: s.transition, opacity: s.isDragging ? 0.6 : 1 }
    : undefined;
  const done = subItems.filter((c) => c.completedAt !== null).length;

  return (
    <li ref={s.setNodeRef} style={style} className="list-none">
      <RowBody
        item={item}
        dragProps={sortable ? { ...s.attributes, ...s.listeners } : undefined}
        progress={subItems.length > 0 ? { done, total: subItems.length } : undefined}
        collapsed={collapsed}
        onToggleCollapse={() => toggleCollapsed(item.id)}
        onAddSub={() => {
          toggleCollapsed(item.id, false);
          setAddingSub(true);
        }}
      />
      {(!collapsed || addingSub) && (subItems.length > 0 || addingSub) && (
        <SubItems parent={item} items={subItems} adding={addingSub} onDoneAdding={() => setAddingSub(false)} />
      )}
    </li>
  );
}

interface BodyProps {
  item: Item;
  dragProps?: Record<string, unknown>;
  isSub?: boolean;
  progress?: { done: number; total: number };
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onAddSub?: () => void;
}

export function RowBody({ item, dragProps, isSub = false, progress, collapsed, onToggleCollapse, onAddSub }: BodyProps) {
  const selected = useStore((s) => s.selectedItemId === item.id);
  const selectItem = useStore((s) => s.selectItem);
  const lists = useStore((s) => s.lists);
  const [editing, setEditing] = useState(false);
  const done = item.completedAt !== null;
  const ownIsTemplate = lists.find((l) => l.id === item.listId)?.isTemplate ?? false;
  const moveTargets = lists.filter((l) => l.isTemplate === ownIsTemplate && (l.id !== item.listId || isSub));

  return (
    <div
      data-item-id={item.id}
      onClick={() => selectItem(item.id)}
      onDoubleClick={() => setEditing(true)}
      className={`group relative flex items-center gap-2 overflow-hidden rounded-lg border py-1.5 pl-2 pr-2 text-sm shadow-sm transition-colors ${
        selected
          ? "border-sky-400 bg-white dark:bg-zinc-800"
          : "border-black/5 bg-white/85 hover:bg-white dark:border-white/5 dark:bg-zinc-900/75 dark:hover:bg-zinc-900"
      }`}
    >
      {item.color && (
        <span data-color-bar className="absolute inset-y-0 left-0 w-1" style={{ background: item.color }} />
      )}
      <span
        {...dragProps}
        title="Drag to reorder"
        className={`cursor-grab select-none px-0.5 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 ${dragProps ? "" : "invisible"}`}
      >
        ⋮⋮
      </span>
      {!isSub && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`w-3 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 ${progress ? "" : "invisible"}`}
          aria-label={collapsed ? "Expand sub-items" : "Collapse sub-items"}
          title={collapsed ? "Expand sub-items" : "Collapse sub-items"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      )}
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

      {progress && (
        <span
          data-progress
          className={`shrink-0 rounded-full px-1.5 text-xs tabular-nums ${
            progress.done === progress.total
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-black/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
          }`}
        >
          {progress.done}/{progress.total}
        </span>
      )}

      {!editing && (
        <span className="hidden items-center gap-0.5 group-hover:flex">
          {onAddSub && (
            <IconButton title="Add sub-item" onClick={(e) => { e.stopPropagation(); onAddSub(); }}>+ sub</IconButton>
          )}
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
                  {l.id === item.listId ? `${l.name} (top level)` : l.name}
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
