import { isIsoDate } from "./shanghai";
import type { CalEvent, ChatMessage, Kind, Proposal, ReminderChoice, Store } from "./types";

const ID_KEY = "due-light.user";
const REMINDERS = new Set<ReminderChoice>(["day_before", "morning_of", "two_days", "week_before", "at_time", "none"]);

export function dataKey(userId: string): string {
  return `due-light.v1.${userId}`;
}

function isKind(value: unknown): value is Kind {
  return value === "homework" || value === "test";
}

function isTime(value: unknown): value is string | null {
  if (value == null) return true;
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}

export function sanitizeEvent(value: unknown): CalEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isId(record.id) || typeof record.title !== "string" || typeof record.date !== "string") return null;
  if (!isIsoDate(record.date) || !isTime(record.time) || !isKind(record.kind)) return null;
  if (!REMINDERS.has(record.reminder as ReminderChoice)) return null;
  if (typeof record.createdAt !== "string") return null;
  const title = record.title.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    id: record.id,
    title: title || "Homework",
    date: record.date,
    time: record.time ?? null,
    kind: record.kind,
    reminder: record.reminder as ReminderChoice,
    notifiedAt: typeof record.notifiedAt === "string" ? record.notifiedAt.slice(0, 40) : null,
    createdAt: record.createdAt.slice(0, 40),
  };
}

function sanitizeProposal(value: unknown): Proposal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isId(record.id) || typeof record.title !== "string" || typeof record.date !== "string") return null;
  if (!isIsoDate(record.date) || !isTime(record.time) || !isKind(record.kind)) return null;
  if (!REMINDERS.has(record.reminder as ReminderChoice)) return null;
  if (record.status !== "pending" && record.status !== "added" && record.status !== "discarded") return null;
  const title = record.title.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    id: record.id,
    title,
    date: record.date,
    time: record.time ?? null,
    kind: record.kind,
    sourceText: typeof record.sourceText === "string" ? record.sourceText.slice(0, 80) : "",
    reminder: record.reminder as ReminderChoice,
    status: record.status,
    eventId: isId(record.eventId) ? record.eventId : undefined,
  };
}

export function sanitizeMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isId(record.id) || (record.role !== "user" && record.role !== "assistant")) return null;
  if (typeof record.text !== "string" || typeof record.createdAt !== "string") return null;
  const proposals = Array.isArray(record.proposals)
    ? record.proposals.map(sanitizeProposal).filter((item): item is Proposal => item !== null).slice(0, 12)
    : undefined;
  return {
    id: record.id,
    role: record.role,
    text: record.text.slice(0, 4000),
    imageName: typeof record.imageName === "string" ? record.imageName.slice(0, 120) : undefined,
    proposals,
    createdAt: record.createdAt.slice(0, 40),
  };
}

function getOrCreateUserId(): string {
  const existing = localStorage.getItem(ID_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(ID_KEY, id);
  return id;
}

export function loadStore(): Store {
  let userId = "";
  try {
    userId = getOrCreateUserId();
    const raw = localStorage.getItem(dataKey(userId));
    if (!raw) return { userId, events: [], messages: [] };
    const parsed = JSON.parse(raw) as { events?: unknown; messages?: unknown };
    const events = Array.isArray(parsed.events)
      ? parsed.events.map(sanitizeEvent).filter((item): item is CalEvent => item !== null).slice(-500)
      : [];
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.map(sanitizeMessage).filter((item): item is ChatMessage => item !== null).slice(-40)
      : [];
    return { userId, events, messages };
  } catch {
    return { userId: userId || crypto.randomUUID(), events: [], messages: [] };
  }
}

export function saveStore(store: Store): boolean {
  try {
    const events = store.events.map(sanitizeEvent).filter((item): item is CalEvent => item !== null).slice(-500);
    const messages = store.messages.map(sanitizeMessage).filter((item): item is ChatMessage => item !== null).slice(-40);
    localStorage.setItem(ID_KEY, store.userId);
    localStorage.setItem(dataKey(store.userId), JSON.stringify({ version: 1, events, messages }));
    return true;
  } catch {
    return false;
  }
}
