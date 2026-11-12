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
import { newListFromTemplate } from "./templates";
import { IconButton } from "./ui";

export default function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const lists = useStore((s) => s.lists);
  const creatingList = useStore((s) => s.creatingList);
  const setCreatingList = useStore((s) => s.setCreatingList);
  const creatingTemplate = useStore((s) => s.creatingTemplate);
  const setCreatingTemplate = useStore((s) => s.setCreatingTemplate);
  const inbox = lists.find((l) => l.isInbox);
  const userLists = lists.filter((l) => !l.isInbox && !l.isTemplate);
  const templates = lists.filter((l) => l.isTemplate);
  const hotkey = useStore((s) => s.settings.toggleHotkey);

  const createAndOpen = async (name: string | null, isTemplate: boolean) => {
    if (!name) return;
    const list = await api.createList(name, isTemplate);
    useStore.getState().setView({ kind: "list", listId: list.id });
  };

  return (
    <aside className="panel flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-black/5 p-3 dark:border-white/5">
      <div className="mb-2 flex items-center justify-between pl-2">
        <span className="text-lg font-semibold tracking-tight">Checklist</span>
        <div className="flex items-center">
          <IconButton title="Search (Ctrl+F)" onClick={() => useStore.getState().setSearchOpen(true)} className="text-sm">
            ⌕
          </IconButton>
          <IconButton title={`Mini view (${hotkey})`} onClick={() => void api.toggleMode()} className="text-sm">
            <span data-mini-view>⤡</span>
          </IconButton>
        </div>
      </div>

      <DueTodayRow />
      {inbox && <ListRow list={inbox} />}

      <SectionHeader label="Lists" onAdd={() => setCreatingList(true)} addTitle="New list (Ctrl+N)" />
      <SortableLists lists={userLists} />
      {creatingList && (
        <NewListInput
          placeholder="List name"
          onDone={(name) => {
            setCreatingList(false);
            void createAndOpen(name, false);
          }}
        />
      )}

      <SectionHeader label="Templates" onAdd={() => setCreatingTemplate(true)} addTitle="New template" />
      <SortableLists lists={templates} />
      {creatingTemplate && (
        <NewListInput
          placeholder="Template name"
          onDone={(name) => {
            setCreatingTemplate(false);
            void createAndOpen(name, true);
          }}
        />
      )}
      {templates.length === 0 && !creatingTemplate && (
        <p className="px-2 py-1 text-xs text-zinc-400 dark:text-zinc-500">
          Reusable checklists. Use “Save as template” on any list.
        </p>
      )}

      <div className="mt-auto pt-4">
        <button
          type="button"
          data-open-settings
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <span aria-hidden>⚙</span> Settings
        </button>
      </div>
    </aside>
  );
}

function DueTodayRow() {
  const active = useStore((s) => s.view?.kind === "today");
  const setView = useStore((s) => s.setView);
  const overdue = useStore((s) => s.today.overdue.length);
  const today = useStore((s) => s.today.today.length);
  return (
    <div
      onClick={() => setView({ kind: "today" })}
      data-nav="today"
      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-black/10 font-medium dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      <span className="w-2.5 text-center text-xs">☀</span>
      <span className="flex-1">Due today</span>
      {overdue > 0 && (
        <span className="rounded-full bg-red-500 px-1.5 text-xs font-medium text-white" title="Overdue">
          {overdue}
        </span>
      )}
      {today > 0 && <span className="text-xs text-zinc-500 dark:text-zinc-400">{today}</span>}
    </div>
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
          aria-label={addTitle}
          className="rounded px-1.5 text-base leading-none hover:bg-black/5 dark:hover:bg-white/10"
        >
          +
        </button>
      )}
    </div>
  );
}

function NewListInput({ placeholder, onDone }: { placeholder: string; onDone: (name: string | null) => void }) {
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

function SortableLists({ lists }: { lists: List[] }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = lists.findIndex((l) => l.id === active.id);
    const to = lists.findIndex((l) => l.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(lists, from, to);
    // Optimistic: patch the store, keep lists outside this section untouched.
    const all = useStore.getState().lists;
    const ids = new Set(lists.map((l) => l.id));
    useStore.getState().setListsLocal([...all.filter((l) => !ids.has(l.id)), ...reordered]);
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

function ListRow({ list }: { list: List }) {
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
      data-list-id={list.id}
      onClick={() => setView({ kind: "list", listId: list.id })}
      onDoubleClick={() => setEditing(true)}
      title={list.isInbox ? "Quick add from the mini view goes here" : undefined}
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-black/10 font-medium dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 ${list.isTemplate ? "rounded-sm" : "rounded-full"}`}
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
      {!editing && (
        <span className="hidden gap-0.5 group-hover:flex">
          {list.isTemplate && (
            <IconButton
              title="New list from template"
              onClick={(e) => {
                e.stopPropagation();
                void newListFromTemplate(list);
              }}
            >
              ⧉
            </IconButton>
          )}
          <IconButton title="Rename" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>✎</IconButton>
          {/* The Inbox can be renamed but never deleted. */}
          {!list.isInbox && <IconButton title="Delete" onClick={remove}>✕</IconButton>}
        </span>
      )}
    </div>
  );
}
