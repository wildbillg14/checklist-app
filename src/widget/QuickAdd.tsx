import { useEffect, useRef, useState } from "react";
import * as api from "../shared/api";
import { todayAt } from "../shared/dates";

/** Name + optional time today. New tasks always go to the Inbox. */
export default function QuickAdd({ focusTick }: { focusTick: number }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusTick > 0) ref.current?.focus();
  }, [focusTick]);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    await api.quickAdd(t, time ? todayAt(time) : null);
    setTitle("");
    setTime("");
    ref.current?.focus();
  };

  return (
    <form
      className="flex shrink-0 items-center gap-1.5 border-t border-black/10 p-2 dark:border-white/10"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        ref={ref}
        data-quick-add
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (setTitle(""), setTime(""))}
        placeholder="Quick add to Inbox…"
        aria-label="Quick add task"
        className="min-w-0 flex-1 rounded-md border border-black/10 bg-white/80 px-2 py-1 text-sm outline-none placeholder:text-zinc-400 focus:border-sky-400 dark:border-white/10 dark:bg-zinc-800/80"
      />
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label="Optional time today"
        title="Optional time today"
        className="w-[5.5rem] rounded-md border border-black/10 bg-white/80 px-1 py-1 text-xs outline-none focus:border-sky-400 dark:border-white/10 dark:bg-zinc-800/80 dark:[color-scheme:dark]"
      />
    </form>
  );
}
