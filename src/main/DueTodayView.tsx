import { format } from "date-fns";
import * as api from "../shared/api";
import { formatDue, formatTime } from "../shared/dates";
import { useStore } from "../shared/store";
import type { ItemWithContext } from "../shared/types";

/** Incomplete items due today plus overdue items (overdue first), from all lists. */
export default function DueTodayView() {
  const { overdue, today } = useStore((s) => s.today);
  const empty = overdue.length === 0 && today.length === 0;

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-baseline gap-3 px-6 pb-3 pt-5">
        <h1 className="text-2xl font-semibold tracking-tight">Due today</h1>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{format(new Date(), "EEEE, MMMM d")}</span>
      </header>
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {empty && (
          <div className="mt-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Nothing due today. Enjoy the free time.
          </div>
        )}
        {overdue.length > 0 && (
          <Group title="Overdue" tone="danger" items={overdue} overdue />
        )}
        {today.length > 0 && <Group title="Today" items={today} />}
      </div>
    </section>
  );
}

function Group({
  title,
  items,
  overdue = false,
  tone,
}: {
  title: string;
  items: ItemWithContext[];
  overdue?: boolean;
  tone?: "danger";
}) {
  return (
    <div className="mb-5">
      <h2
        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
          tone === "danger" ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {title} · {items.length}
      </h2>
      <ul className="flex flex-col gap-1">
        {items.map((i) => (
          <TodayRow key={i.id} item={i} overdue={overdue} />
        ))}
      </ul>
    </div>
  );
}

function TodayRow({ item, overdue }: { item: ItemWithContext; overdue: boolean }) {
  const jumpToItem = useStore((s) => s.jumpToItem);
  return (
    <li
      data-item-id={item.id}
      onClick={() => jumpToItem(item)}
      className={`relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border bg-white/85 py-1.5 pl-3 pr-2 text-sm shadow-sm hover:bg-white dark:bg-zinc-900/75 dark:hover:bg-zinc-900 ${
        overdue ? "border-red-300 dark:border-red-900" : "border-black/5 dark:border-white/5"
      }`}
    >
      {item.color && <span className="absolute inset-y-0 left-0 w-1" style={{ background: item.color }} />}
      <input
        type="checkbox"
        checked={false}
        onChange={() => void api.setItemCompleted(item.id, true)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
        aria-label="Mark as done"
      />
      <span className="flex-1 truncate">
        {item.parentTitle && <span className="text-zinc-400">{item.parentTitle} › </span>}
        {item.title}
      </span>
      <span className="shrink-0 rounded px-1.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: item.listAccent ?? "#a1a1aa" }} />
        {item.listName}
      </span>
      <span
        className={`w-28 shrink-0 text-right text-xs ${
          overdue ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {overdue ? formatDue(item) : item.dueAllDay || item.dueAt === null ? "Today" : formatTime(item.dueAt)}
      </span>
    </li>
  );
}
