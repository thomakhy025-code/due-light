import { daysBetween, isIsoDate, isoFrom, type WallClock } from "./shanghai";
import { kindSignal, parseDeadlines } from "./parse-deadlines";
import type { DraftEvent, Kind } from "./types";

function coerceDate(value: string, clock: WallClock): string | null {
  const trimmed = value.trim();
  if (isIsoDate(trimmed)) return trimmed;
  const slash = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(trimmed);
  if (slash) {
    const iso = isoFrom(Number(slash[1]), Number(slash[2]), Number(slash[3]));
    if (iso) return iso;
  }
  return parseDeadlines(trimmed, clock)[0]?.date ?? null;
}

function coerceTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(trimmed);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function coerceKind(value: unknown, title: string): Kind {
  const text = `${typeof value === "string" ? value : ""} ${title}`;
  if (typeof value === "string" && /test|exam|quiz/i.test(value) && !/homework|assignment/i.test(value)) return "test";
  return kindSignal(text) ?? "homework";
}

function cleanTitle(value: string, kind: Kind): string {
  const title = value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (title) return title;
  return kind === "test" ? "Test" : "Homework";
}

export function draftsFromModelPayload(payload: unknown, clock: WallClock): DraftEvent[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown }).events)
      ? (payload as { events: unknown[] }).events
      : [];
  const events: DraftEvent[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawTitle = typeof record.title === "string" ? record.title : "";
    const kind = coerceKind(record.kind, rawTitle);
    const title = cleanTitle(rawTitle, kind);
    const date = typeof record.date === "string" ? coerceDate(record.date, clock) : null;
    if (!date) continue;
    const distance = daysBetween(clock.iso, date);
    if (distance < -370 || distance > 1500) continue;
    events.push({
      title,
      date,
      time: coerceTime(record.time),
      kind,
      sourceText: "Read from your note or photo",
    });
    if (events.length >= 12) break;
  }
  return events;
}

export function draftsFromModelContent(content: string, clock: WallClock): DraftEvent[] {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return draftsFromModelPayload(JSON.parse(trimmed), clock);
  } catch {
    return [];
  }
}
