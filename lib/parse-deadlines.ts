import * as chrono from "chrono-node";
import { daysBetween, isIsoDate, isoFrom, type WallClock } from "./shanghai";
import type { DraftEvent, Kind } from "./types";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAY_NEXT: Array<[RegExp, string]> = [
  [/下个?星期日|下个?星期天|下个?周日|下个?周天/g, " next Sunday "],
  [/下个?星期一|下个?周一/g, " next Monday "],
  [/下个?星期二|下个?周二/g, " next Tuesday "],
  [/下个?星期三|下个?周三/g, " next Wednesday "],
  [/下个?星期四|下个?周四/g, " next Thursday "],
  [/下个?星期五|下个?周五/g, " next Friday "],
  [/下个?星期六|下个?周六/g, " next Saturday "],
];

const WEEKDAY: Array<[RegExp, string]> = [
  [/星期日|星期天|周日|周天/g, " Sunday "],
  [/星期一|周一/g, " Monday "],
  [/星期二|周二/g, " Tuesday "],
  [/星期三|周三/g, " Wednesday "],
  [/星期四|周四/g, " Thursday "],
  [/星期五|周五/g, " Friday "],
  [/星期六|周六/g, " Saturday "],
];

const KEYWORD =
  /\b(quizzes|quiz|exams?|tests?|midterms?|finals?|orals?|assessments?|homework|assignments?|essays?|papers?|psets?|problem[\s-]?sets?|labs?|readings?|worksheets?|projects?|hw)\b|考试|测验|小测|期中|期末|作业|论文|实验/gi;

const NOT_A_DATE_AFTER =
  /^\s+(?:problem|chapter|page|pages|hw|homework|assignment|set|edition|floor|place|grade|period|item|question|part|step|week|time|try|attempt|draft|version|round|half|quarter)\b/i;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function expandOrdinals(text: string, clock: WallClock): string {
  return text.replace(/\bthe\s+(\d{1,2})(st|nd|rd|th)\b/gi, (full, dayRaw: string, _suffix: string, offset: number) => {
    const day = Number(dayRaw);
    if (day < 1 || day > 31) return full;
    const after = text.slice(offset + full.length);
    if (/^\s+of\s+[A-Za-z]/i.test(after) || NOT_A_DATE_AFTER.test(after)) return full;
    const before = text.slice(Math.max(0, offset - 16), offset);
    const hinted = /\b(?:due|on|by|before|after)\s+$/i.test(before);
    if (day <= 3 && !hinted) return full;
    let year = clock.year;
    let month = clock.month;
    if (day < clock.day || day > daysInMonth(year, month)) {
      ({ year, month } = shiftMonth(year, month, 1));
    }
    while (day > daysInMonth(year, month)) {
      ({ year, month } = shiftMonth(year, month, 1));
    }
    return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
  });
}

export function normalizeDeadlineText(text: string, clock: WallClock): string {
  let value = text.normalize("NFKC").replace(/\u3000/g, " ").replace(/[，、]/g, ", ").replace(/[。；]/g, ". ");
  value = value
    .replace(/下午\s*(\d{1,2})\s*点半/g, " $1:30 pm ")
    .replace(/上午\s*(\d{1,2})\s*点半/g, " $1:30 am ")
    .replace(/晚上\s*(\d{1,2})\s*点半/g, " $1:30 pm ")
    .replace(/下午\s*(\d{1,2})\s*点\s*(\d{1,2})\s*分?/g, " $1:$2 pm ")
    .replace(/上午\s*(\d{1,2})\s*点\s*(\d{1,2})\s*分?/g, " $1:$2 am ")
    .replace(/晚上\s*(\d{1,2})\s*点\s*(\d{1,2})\s*分?/g, " $1:$2 pm ")
    .replace(/下午\s*(\d{1,2})\s*点/g, " $1:00 pm ")
    .replace(/上午\s*(\d{1,2})\s*点/g, " $1:00 am ")
    .replace(/晚上\s*(\d{1,2})\s*点/g, " $1:00 pm ")
    .replace(/(\d{1,2})\s*点半/g, " $1:30 ")
    .replace(/(\d{1,2})\s*点\s*(\d{1,2})\s*分?/g, " $1:$2 ")
    .replace(/(\d{1,2})\s*点/g, " $1:00 ");
  value = value.replace(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g, (full, year: string, month: string, day: string) => {
    const name = MONTH_NAMES[Number(month) - 1];
    return name ? ` ${name} ${Number(day)}, ${year} ` : full;
  });
  value = value.replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g, (full, month: string, day: string) => {
    const name = MONTH_NAMES[Number(month) - 1];
    return name ? ` ${name} ${Number(day)} ` : full;
  });
  for (const [pattern, replacement] of WEEKDAY_NEXT) value = value.replace(pattern, replacement);
  for (const [pattern, replacement] of WEEKDAY) value = value.replace(pattern, replacement);
  value = value
    .replace(/大后天/g, " in 3 days ")
    .replace(/后天/g, " in 2 days ")
    .replace(/明天/g, " tomorrow ")
    .replace(/今晚/g, " tonight ")
    .replace(/今天/g, " today ")
    .replace(/\b(?:the\s+)?day\s+after\s+tomorrow\b/gi, " in 2 days ");
  value = value.replace(/[ \t]{2,}/g, " ").trim();
  return expandCompactTimes(expandOrdinals(value, clock));
}

const COURSE_CODE = /\b([A-Za-z]{4})(\d{4})\b/;

export function courseCodeTitle(text: string): string | null {
  const match = COURSE_CODE.exec(text);
  if (!match) return null;
  return `${match[1].toUpperCase()}${match[2]}`;
}

function expandCompactTimes(value: string): string {
  return value.replace(
    /(^|[^A-Za-z0-9])([01]\d|2[0-3])([0-5]\d)\b/g,
    (full, prefix: string, hour: string, minute: string, offset: number) => {
      const lookbehind = value.slice(Math.max(0, offset - 18), offset + prefix.length);
      const nearDate =
        /\b(?:on|at|@)\s*$/i.test(lookbehind) ||
        /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*$/i.test(lookbehind) ||
        /\b\d{1,2}(?:st|nd|rd|th)?\s+$/i.test(lookbehind);
      if (!nearDate) return full;
      return `${prefix}${hour}:${minute}`;
    },
  );
}

function isBareTime(matchText: string): boolean {
  const stripped = matchText.trim().replace(/^(?:at|@|around|by)\s+/i, "");
  return /^(?:noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i.test(stripped);
}

function laterKind(text: string): Kind {
  let last: Kind = "homework";
  const pattern = new RegExp(KEYWORD.source, "gi");
  const testWord = /quiz|exam|test|midterm|final|oral|assessment|考试|测验|小测|期中|期末/i;
  for (const match of text.matchAll(pattern)) {
    last = testWord.test(match[0]) ? "test" : "homework";
  }
  return last;
}

export function kindSignal(text: string): Kind | null {
  if (!text.trim()) return null;
  const hasTest = /(?:\b(?:quizzes|quiz|exams?|tests?|midterms?|finals?|orals?|assessments?)\b|考试|测验|小测|期中|期末)/i.test(text);
  const hasHomework = /(?:\b(?:homework|assignments?|essays?|papers?|psets?|problem[\s-]?sets?|labs?|readings?|worksheets?|projects?|hw)\b|作业|论文|实验)/i.test(text);
  if (!hasTest && !hasHomework) return null;
  if (hasTest && hasHomework) {
    if (
      /\b(?:final|midterm)s?\b/i.test(text) &&
      /\b(?:paper|essay|draft|project|report)\b/i.test(text) &&
      !/\b(?:exams?|tests?|quizzes|quiz)\b/i.test(text)
    ) {
      return "homework";
    }
    return laterKind(text);
  }
  return hasTest ? "test" : "homework";
}

function kindForClause(before: string, match: string, after: string): Kind {
  return kindSignal(`${before} ${match}`) ?? kindSignal(after.slice(0, 48)) ?? "homework";
}

function cleanClause(raw: string): string {
  let value = raw.replace(/\s+/g, " ").trim();
  if (!value) return "";
  const chunks = value.split(/[\n•|]+/).map((part) => part.trim()).filter(Boolean);
  value = chunks[chunks.length - 1] ?? "";
  const sentences = value.split(/(?<=[.!?])\s+/);
  value = (sentences[sentences.length - 1] ?? value).trim();
  for (let i = 0; i < 4; i += 1) {
    const next = value
      .replace(/^(?:please|kindly|can you|could you|would you|mark|add|put|remember|hey|hi|hello|ok|okay|also|and|then|plus|so)\b[\s,:]*/i, "")
      .trim();
    if (next === value) break;
    value = next;
  }
  for (let i = 0; i < 6; i += 1) {
    const next = value
      .replace(/(?:^|\s)(?:is|are|was|were|on|by|due|at|before|after|around|for|the|a|an|this|next|my|our)\s*$/i, "")
      .trim();
    if (next === value) break;
    value = next;
  }
  value = value.replace(/^(?:the|a|an|my|our)\s+/i, "").trim();
  value = value.replace(/^[\s,.:;\-–—]+|[\s,.:;\-–—]+$/g, "");
  if (value.length > 80) value = `${value.slice(0, 77).trim()}…`;
  return value;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleFrom(before: string, after: string, kind: Kind): string {
  const coded = courseCodeTitle(`${before} ${after}`);
  if (coded) return coded;
  const primary = cleanClause(before);
  if (primary) return capitalize(primary);
  const secondary = cleanClause((after.split(/[\n.]+/)[0] ?? "").slice(0, 80));
  if (secondary) return capitalize(secondary);
  return kind === "test" ? "Test" : "Homework";
}

function referenceDate(clock: WallClock): Date {
  // Midnight-plus keeps "today" from rolling into next year when the real clock is after noon.
  return new Date(clock.year, clock.month - 1, clock.day, 0, 1, 0);
}

function dedupe(events: DraftEvent[]): DraftEvent[] {
  const seen = new Set<string>();
  const unique: DraftEvent[] = [];
  for (const event of events) {
    const key = `${event.date}|${event.time ?? ""}|${event.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

export function parseDeadlines(text: string, clock: WallClock): DraftEvent[] {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) return [];
  const normalized = normalizeDeadlineText(trimmed.slice(0, 6000), clock);
  const results = chrono.parse(normalized, referenceDate(clock), { forwardDate: true });
  const events: DraftEvent[] = [];
  let cursor = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const before = normalized.slice(cursor, result.index);
    const matchEnd = result.index + result.text.length;
    const nextIndex = results[index + 1]?.index ?? normalized.length;
    const after = normalized.slice(matchEnd, nextIndex);
    cursor = matchEnd;
    if (isBareTime(result.text)) continue;
    const year = result.start.get("year");
    const month = result.start.get("month");
    const day = result.start.get("day");
    if (year == null || month == null || day == null) continue;
    const date = isoFrom(year, month, day);
    if (!date || !isIsoDate(date)) continue;
    const distance = daysBetween(clock.iso, date);
    if (distance < -370 || distance > 1500) continue;
    let time: string | null = null;
    if (result.start.isCertain("hour")) {
      const hour = result.start.get("hour");
      const minute = result.start.get("minute") ?? 0;
      if (hour != null && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      }
    }
    const kind = kindForClause(before, result.text, after);
    events.push({
      title: titleFrom(before, after, kind),
      date,
      time,
      kind,
      sourceText: result.text.trim().slice(0, 80),
    });
    if (events.length >= 12) break;
  }
  return dedupe(events);
}
