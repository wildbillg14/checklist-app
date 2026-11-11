import * as api from "../shared/api";
import { formatDue, formatTime } from "../shared/dates";
import type { ItemWithContext, TodayView } from "../shared/types";

/** Overdue first (red marker), then today's timed tasks by time, then untimed. */
export default function TodayList({ today }: { today: TodayView }) {
  const empty = today.overdue.length === 0 && today.today.length === 0;
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      {empty && (
        <li className="mt-10 px-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          All clear for today ✓
        </li>
      )}
      {today.overdue.map((i) => (
        <Row key={i.id} item={i} overdue />
      ))}
      {today.today.map((i) => (
        <Row key={i.id} item={i} overdue={false} />
      ))}
    </ul>
  );
}

function Row({ item, overdue }: { item: ItemWithContext; overdue: boolean }) {
  return (
    <li
      data-widget-item={item.id}
      data-overdue={overdue || undefined}
      className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10"
    >
      <span
        className="h-5 w-1 shrink-0 rounded-full"
        style={{ background: overdue ? "#ef4444" : (item.color ?? "transparent") }}
        title={overdue ? "Overdue" : undefined}
      />
      <input
        type="checkbox"
        checked={false}
        onChange={() => void api.setItemCompleted(item.id, true)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
        aria-label={`Complete ${item.title}`}
      />
      {item.color && overdue && (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
      )}
      <span className="min-w-0 flex-1 truncate" title={`${item.title} · ${item.listName}`}>
        {item.title}
      </span>
      <span
        className={`shrink-0 text-xs tabular-nums ${
          overdue ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {overdue ? formatDue(item).replace(/^Today /, "") : item.dueAllDay || item.dueAt === null ? "" : formatTime(item.dueAt)}
      </span>
    </li>
  );
}
