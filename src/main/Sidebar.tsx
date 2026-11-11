import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ask } from "@tauri-apps/plugin-dialog";
import * as api from "../shared/api";
import { useStore } from "../shared/store";
import type { List } from "../shared/types";
import InlineEdit from "./InlineEdit";

export default function Sidebar() {
  const lists = useStore((s) => s.lists);
  const creatingList = useStore((s) => s.creatingList);
  const setCreatingList = useStore((s) => s.setCreatingList);
  const inbox = lists.find((l) => l.isInbox);
  const userLists = lists.filter((l) => !l.isInbox && !l.isTemplate);

  return (
    <aside className="panel flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-black/5 p-3 dark:border-white/5">
      <div className="mb-2 px-2 text-lg font-semibold tracking-tight">Checklist</div>

      {inbox && <ListRow list={inbox} />}

      <SectionHeader label="Lists" onAdd={() => setCreatingList(true)} addTitle="New list (Ctrl+N)" />
      <SortableLists lists={userLists} />
      {creatingList && (
        <NewListInput
          placeholder="List name"
          onDone={async (name) => {
            setCreatingList(false);
            if (name) {
              const list = await api.createList(name);
              useStore.getState().setView({ kind: "list", listId: list.id });
            }
          }}
        />
      )}
    </aside>
  );
}

export function SectionHeader({ label, onAdd, addTitle }: { label: string; onAdd?: () => void; addTitle?: string }) {
  return (
    <div className="mt-4 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      <span>{label}</span>
      {onAdd && (
        <button
          onClick={onAdd}
          title={addTitle}
          className="rounded px-1.5 text-base leading-none hover:bg-black/5 dark:hover:bg-white/10"
        >
          +
        </button>
      )}
    </div>
  );
}

export function NewListInput({ placeholder, onDone }: { placeholder: string; onDone: (name: string | null) => void }) {
  return (
    <div className="px-1 py-1">
      <InlineEdit
        value=""
        placeholder={placeholder}
        className="w-full text-sm"
        onSave={(v) => onDone(v)}
        onCancel={() => onDone(null)}
      />
    </div>
  );
}

export function SortableLists({ lists }: { lists: List[] }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = lists.findIndex((l) => l.id === active.id);
    const to = lists.findIndex((l) => l.id === over.id);
    const reordered = arrayMove(lists, from, to);
    // Optimistic: patch the store, keep lists outside this section untouched.
    const all = useStore.getState().lists;
    const ids = new Set(lists.map((l) => l.id));
    const others = all.filter((l) => !ids.has(l.id));
    useStore.getState().setListsLocal([...others, ...reordered]);
    void api.reorderLists(reordered.map((l) => l.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        {lists.map((l) => (
          <SortableListRow key={l.id} list={l} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableListRow({ list }: { list: List }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      {...attributes}
      {...listeners}
    >
      <ListRow list={list} />
    </div>
  );
}

export function ListRow({ list }: { list: List }) {
  const active = useStore((s) => s.view?.kind === "list" && s.view.listId === list.id);
  const setView = useStore((s) => s.setView);
  const [editing, setEditing] = useState(false);

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await ask(`Delete "${list.name}" and all of its tasks?`, {
      title: list.isTemplate ? "Delete template" : "Delete list",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (ok) await api.deleteList(list.id);
  };

  return (
    <div
      onClick={() => setView({ kind: "list", listId: list.id })}
      onDoubleClick={() => !list.isInbox && setEditing(true)}
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-black/10 font-medium dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: list.accentColor ?? (list.isInbox ? "#0ea5e9" : "#a1a1aa") }}
      />
      {editing ? (
        <InlineEdit
          value={list.name}
          className="flex-1 text-sm"
          onSave={(v) => {
            setEditing(false);
            void api.renameList(list.id, v);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <span className="flex-1 truncate">{list.name}</span>
      )}
      {!list.isInbox && !editing && (
        <span className="hidden gap-0.5 group-hover:flex">
          <IconButton title="Rename" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>✎</IconButton>
          <IconButton title="Delete" onClick={remove}>✕</IconButton>
        </span>
      )}
    </div>
  );
}

export function IconButton({
  children,
  title,
  onClick,
  active = false,
  className = "",
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-black/10 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-50 ${
        active ? "bg-black/10 text-zinc-900 dark:bg-white/15 dark:text-zinc-50" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}
