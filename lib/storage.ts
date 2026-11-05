import { isIsoDate } from "./shanghai";
import type { CalEvent, ChatMessage, Flashcard, Kind, PracticeQuestion, Proposal, ReminderChoice, Store, StudySet } from "./types";

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
    studySetId: isId(record.studySetId) ? record.studySetId : undefined,
    createdAt: record.createdAt.slice(0, 40),
  };
}

function cleanText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanBlock(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function sanitizeCard(value: unknown): Flashcard | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isId(record.id) || typeof record.front !== "string" || typeof record.back !== "string") return null;
  const front = cleanText(record.front, 120);
  const back = cleanText(record.back, 400);
  if (!front || !back) return null;
  return { id: record.id, front, back, known: record.known === true };
}

function sanitizeQuestion(value: unknown): PracticeQuestion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isId(record.id) || typeof record.prompt !== "string" || typeof record.approach !== "string") return null;
  const prompt = cleanBlock(record.prompt, 900);
  const approach = cleanBlock(record.approach, 900);
  if (!prompt || !approach) return null;
  return { id: record.id, prompt, approach };
}

export function sanitizeStudy(value: unknown): StudySet | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isId(record.id) || typeof record.title !== "string" || typeof record.createdAt !== "string") return null;
  if (record.source !== "notes" && record.source !== "photo" && record.source !== "model") return null;
  const points = Array.isArray(record.points)
    ? record.points.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 8)
    : [];
  const flashcards = Array.isArray(record.flashcards)
    ? record.flashcards.map(sanitizeCard).filter((item): item is Flashcard => item !== null).slice(0, 8)
    : [];
  const questions = Array.isArray(record.questions)
    ? record.questions.map(sanitizeQuestion).filter((item): item is PracticeQuestion => item !== null).slice(0, 4)
    : [];
  if (points.length < 2 || flashcards.length < 1 || questions.length < 1) return null;
  return {
    id: record.id,
    title: cleanText(record.title, 80) || "Course notes",
    points,
    flashcards,
    questions,
    source: record.source,
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
    if (!raw) return { userId, events: [], messages: [], studies: [] };
    const parsed = JSON.parse(raw) as { events?: unknown; messages?: unknown; studies?: unknown };
    const events = Array.isArray(parsed.events)
      ? parsed.events.map(sanitizeEvent).filter((item): item is CalEvent => item !== null).slice(-500)
      : [];
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.map(sanitizeMessage).filter((item): item is ChatMessage => item !== null).slice(-40)
      : [];
    const studies = Array.isArray(parsed.studies)
      ? parsed.studies.map(sanitizeStudy).filter((item): item is StudySet => item !== null).slice(0, 30)
      : [];
    return { userId, events, messages, studies };
  } catch {
    return { userId: userId || crypto.randomUUID(), events: [], messages: [], studies: [] };
  }
}

export function saveStore(store: Store): boolean {
  try {
    const events = store.events.map(sanitizeEvent).filter((item): item is CalEvent => item !== null).slice(-500);
    const messages = store.messages.map(sanitizeMessage).filter((item): item is ChatMessage => item !== null).slice(-40);
    const studies = (store.studies ?? []).map(sanitizeStudy).filter((item): item is StudySet => item !== null).slice(0, 30);
    localStorage.setItem(ID_KEY, store.userId);
    localStorage.setItem(dataKey(store.userId), JSON.stringify({ version: 1, events, messages, studies }));
    return true;
  } catch {
    return false;
  }
}
