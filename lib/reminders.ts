import { addDays, formatShort, formatTime, shanghaiInstant } from "./shanghai";
import type { CalEvent, ReminderChoice } from "./types";

export const REMINDER_OPTIONS: Array<{ value: ReminderChoice; label: string }> = [
  { value: "day_before", label: "Day before, 8:00 am" },
  { value: "morning_of", label: "Morning of the event, 8:00 am" },
  { value: "two_days", label: "Two days before, 8:00 am" },
  { value: "week_before", label: "One week before, 8:00 am" },
  { value: "at_time", label: "At the event time" },
  { value: "none", label: "No reminder" },
];

export function reminderInstant(event: Pick<CalEvent, "date" | "time" | "reminder">): Date | null {
  switch (event.reminder) {
    case "none":
      return null;
    case "day_before":
      return shanghaiInstant(addDays(event.date, -1), 8, 0);
    case "morning_of":
      return shanghaiInstant(event.date, 8, 0);
    case "two_days":
      return shanghaiInstant(addDays(event.date, -2), 8, 0);
    case "week_before":
      return shanghaiInstant(addDays(event.date, -7), 8, 0);
    case "at_time": {
      if (!event.time) return shanghaiInstant(event.date, 8, 0);
      const [hour, minute] = event.time.split(":").map(Number);
      return shanghaiInstant(event.date, hour, minute);
    }
    default:
      return null;
  }
}

export function eventEndInstant(event: Pick<CalEvent, "date" | "time">): Date {
  if (event.time) {
    const [hour, minute] = event.time.split(":").map(Number);
    return new Date(shanghaiInstant(event.date, hour, minute).getTime() + 2 * 60 * 60 * 1000);
  }
  return shanghaiInstant(addDays(event.date, 1), 0, 0);
}

export function shouldNotify(event: Pick<CalEvent, "date" | "time" | "reminder" | "notifiedAt">, now: Date): boolean {
  if (event.notifiedAt) return false;
  const at = reminderInstant(event);
  if (!at) return false;
  const end = eventEndInstant(event);
  return now.getTime() >= at.getTime() && now.getTime() < end.getTime();
}

export function notificationBody(event: Pick<CalEvent, "title" | "date" | "time" | "kind">, todayIso: string): string {
  const when = event.date === todayIso ? "Today" : event.date === addDays(todayIso, 1) ? "Tomorrow" : formatShort(event.date);
  const time = event.time ? ` at ${formatTime(event.time)}` : "";
  const kind = event.kind === "test" ? "Test" : "Homework";
  return `${when}${time}: ${event.title} (${kind})`;
}

export function compareEvents(a: Pick<CalEvent, "date" | "time" | "title">, b: Pick<CalEvent, "date" | "time" | "title">): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (!a.time && b.time) return -1;
  if (a.time && !b.time) return 1;
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.title.localeCompare(b.title);
}
