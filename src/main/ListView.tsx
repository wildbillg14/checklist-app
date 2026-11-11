import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ask } from "@tauri-apps/plugin-dialog";
import * as api from "../shared/api";
import { useCurrentList, useStore } from "../shared/store";
import type { Item } from "../shared/types";
import InlineEdit from "./InlineEdit";
import ItemRow from "./ItemRow";
import { newListFromTemplate, saveAsTemplate } from "./templates";
import { ToolbarButton } from "./ui";

export const ADD_ITEM_INPUT_ID = "add-item-input";

export default function ListView() {
  const list = useCurrentList();
  const items = useStore((s) => s.items);
  const showCompleted = useStore((s) => s.settings.showCompleted);
  const updateSetting = useStore((s) => s.updateSetting);
  const pendingScrollId = useStore((s) => s.pendingScrollId);
  const [renaming, setRenaming] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // After a search jump, scroll the target row into view once it renders.
  useEffect(() => {
    if (pendingScrollId === null) return;
    const el = document.querySelector(`[data-item-id="${pendingScrollId}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      useStore.getState().clearPendingScroll();
    }
  }, [pendingScrollId, items]);

  if (!list) return <div className="flex-1" />;

  const top = items.filter((i) => i.parentId === null);
  const visible = showCompleted ? top : top.filter((i) => i.completedAt === null);
  const childrenOf = new Map<number, Item[]>();
  for (const i of items) {
    if (i.parentId !== null) childrenOf.set(i.parentId, [...(childrenOf.get(i.parentId) ?? []), i]);
  }
  const doneCount = items.filter((i) => i.completedAt !== null).length;
  const openCount = top.filter((i) => i.completedAt === null).length;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Reorder within the full sibling array so hidden (completed) items keep their slots.
    const from = top.findIndex((i) => i.id === active.id);
    const to = top.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(top, from, to);
    useStore.getState().setItemsLocal([...reordered, ...items.filter((i) => i.parentId !== null)]);
    void api.reorderItems(reordered.map((i) => i.id));
  };

  const clear = async () => {
    const ok = await ask(`Remove ${doneCount} completed task${doneCount === 1 ? "" : "s"} from "${list.name}"?`, {
      title: "Clear completed",
      kind: "warning",
      okLabel: "Clear",
      cancelLabel: "Cancel",
    });
    if (ok) await api.clearCompleted(list.id);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 px-6 pb-3 pt-5">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: list.accentColor ?? "#a1a1aa" }} />
        {renaming ? (
          <InlineEdit
            value={list.name}
            className="text-2xl font-semibold"
            onSave={(v) => {
              setRenaming(false);
              void api.renameList(list.id, v);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <h1
            className="truncate text-2xl font-semibold tracking-tight"
            onDoubleClick={() => !list.isInbox && setRenaming(true)}
            title={list.isInbox ? undefined : "Double-click to rename"}
          >
            {list.name}
          </h1>
        )}
        {list.isTemplate && (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            Template
          </span>
        )}
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{openCount} open</span>
        <div className="ml-auto flex items-center gap-1">
          {list.isTemplate ? (
            <ToolbarButton onClick={() => void newListFromTemplate(list)}>New list from template</ToolbarButton>
          ) : (
            !list.isInbox && (
              <ToolbarButton onClick={() => void saveAsTemplate(list)}>Save as template</ToolbarButton>
            )
          )}
          <ToolbarButton onClick={() => void updateSetting("showCompleted", !showCompleted)}>
            {showCompleted ? "Hide completed" : "Show completed"}
          </ToolbarButton>
          <ToolbarButton onClick={() => void clear()} disabled={doneCount === 0}>
            Clear completed
          </ToolbarButton>
        </div>
      </header>

      <div className="px-6">
        <AddItemInput listId={list.id} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
        {visible.length === 0 ? (
          <EmptyState hasHidden={top.length > 0} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-1">
                {visible.map((item) => (
                  <ItemRow key={item.id} item={item} subItems={childrenOf.get(item.id)} sortable />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </section>
  );
}

function AddItemInput({ listId, parentId = null }: { listId: number; parentId?: number | null }) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        setTitle("");
        void api.createItem(listId, t, parentId);
      }}
    >
      <input
        id={ADD_ITEM_INPUT_ID}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (setTitle(""), e.currentTarget.blur())}
        placeholder="Add a task and press Enter"
        className="w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-sm shadow-sm outline-none placeholder:text-zinc-400 focus:border-sky-400 dark:border-white/10 dark:bg-zinc-900/70"
      />
    </form>
  );
}

function EmptyState({ hasHidden }: { hasHidden: boolean }) {
  return (
    <div className="mt-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
      {hasHidden ? "All done here. Completed tasks are hidden." : "No tasks yet. Type above and press Enter."}
    </div>
  );
}
