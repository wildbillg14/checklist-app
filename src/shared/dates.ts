import { format, isToday, isTomorrow, isYesterday, isSameYear, startOfDay } from "date-fns";
import type { Item } from "./types";

type DueFields = Pick<Item, "dueAt" | "dueAllDay" | "completedAt">;

/** "Today" is always computed in local time. */
export function isOverdue(item: DueFields, now: number = Date.now()): boolean {
  if (item.completedAt !== null || item.dueAt === null) return false;
  return item.dueAllDay ? item.dueAt < startOfDay(now).getTime() : item.dueAt < now;
}

export function formatTime(ms: number): string {
  return format(ms, "h:mm a");
}

/** Short human label for a due date, e.g. "Today 3:00 PM", "Tomorrow", "Mon, Nov 3". */
export function formatDue(item: Pick<Item, "dueAt" | "dueAllDay">): string {
  if (item.dueAt === null) return "";
  const d = new Date(item.dueAt);
  let day: string;
  if (isToday(d)) day = "Today";
  else if (isTomorrow(d)) day = "Tomorrow";
  else if (isYesterday(d)) day = "Yesterday";
  else day = format(d, isSameYear(d, new Date()) ? "EEE, MMM d" : "MMM d, yyyy");
  return item.dueAllDay ? day : `${day} ${formatTime(item.dueAt)}`;
}

/** Value for <input type="date"> from epoch ms (local). */
export function toDateInput(ms: number): string {
  return format(ms, "yyyy-MM-dd");
}

/** Value for <input type="time"> from epoch ms (local). */
export function toTimeInput(ms: number): string {
  return format(ms, "HH:mm");
}

/** Combine local date ("yyyy-MM-dd") and optional time ("HH:mm") into epoch ms. */
export function fromInputs(date: string, time: string | null): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time ? time.split(":").map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/** Epoch ms for today (local) at the given "HH:mm". */
export function todayAt(time: string): number {
  return fromInputs(toDateInput(Date.now()), time);
}
