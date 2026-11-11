import { useEffect, useRef, useState } from "react";
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
import * as api from "../shared/api";
import { useStore } from "../shared/store";
import type { Item } from "../shared/types";
import { RowBody } from "./ItemRow";

interface Props {
  parent: Item;
  items: Item[];
  adding: boolean;
  onDoneAdding: () => void;
}

/** One level of sub-items under a parent: sortable among themselves. */
export default function SubItems({ parent, items, adding, onDoneAdding }: Props) {
  const showCompleted = useStore((s) => s.settings.showCompleted);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const visible = showCompleted ? items : items.filter((i) => i.completedAt === null);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(items, from, to);
    const all = useStore.getState().items;
    const ids = new Set(items.map((i) => i.id));
    useStore.getState().setItemsLocal([...all.filter((i) => !ids.has(i.id)), ...reordered]);
    void api.reorderItems(reordered.map((i) => i.id));
  };

  return (
    <div className="ml-9 mt-1 flex flex-col gap-1 border-l-2 border-black/5 pl-2 dark:border-white/10">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            {visible.map((i) => (
              <SortableSubRow key={i.id} item={i} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {adding && <AddSubItem parent={parent} onDone={onDoneAdding} />}
    </div>
  );
}

function SortableSubRow({ item }: { item: Item }) {
  const s = useSortable({ id: item.id });
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition, opacity: s.isDragging ? 0.6 : 1 }}
      className="list-none"
    >
      <RowBody item={item} isSub dragProps={{ ...s.attributes, ...s.listeners }} />
    </li>
  );
}

function AddSubItem({ parent, onDone }: { parent: Item; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return onDone();
        setTitle("");
        void api.createItem(parent.listId, t, parent.id);
      }}
    >
      <input
        ref={ref}
        data-add-sub={parent.id}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onDone();
        }}
        onBlur={() => !title.trim() && onDone()}
        placeholder="Add a sub-item and press Enter"
        className="w-full rounded-md border border-dashed border-black/15 bg-white/70 px-2 py-1 text-sm outline-none focus:border-sky-400 dark:border-white/15 dark:bg-zinc-900/60"
      />
    </form>
  );
}
