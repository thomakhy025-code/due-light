import { answerFromNotes, deskSummary, groundedInSource, notesCoverQuestion } from "./material-questions";
import { prepareStudyModel, studyModelSentence, studyModelState, MODEL_FAILED } from "./local-model";
import { parseDeadlines } from "./parse-deadlines";
import { lookupPublicFact } from "./public-lookup";
import { formatLong, type WallClock } from "./shanghai";
import { asksToStudy, studyFromNotes } from "./study-notes";
import type { DraftEvent, Proposal, StudyDraft } from "./types";

export type DeskKind = "deadline" | "notes" | "question" | "followup";

export type PriorNotes = {
  title: string;
  points: string[];
  prompts: string[];
};

export type DeskReply = {
  kind: DeskKind;
  text: string;
  proposals: Proposal[];
  study: StudyDraft | null;
  modelNote: string | null;
};

function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[?？]\s*$/.test(trimmed) && trimmed.length < 500) return true;
  return /^(why|how|what|when|where|which|who|explain|compare|does|do|is|are|can|could)\b/i.test(trimmed) && trimmed.length < 320 && !trimmed.includes("\n");
}

export function classifyTurn(text: string, clock: WallClock, prior: PriorNotes | null): DeskKind {
  const trimmed = text.trim();
  const deadlines = trimmed ? parseDeadlines(trimmed, clock) : [];
  const notes = trimmed ? studyFromNotes(trimmed) : null;
  const asked = asksToStudy(trimmed);
  const question = isQuestion(trimmed);
  const bulky = trimmed.length > 180 || /[\n•]|(?:^|\n)\s*[-*]/.test(trimmed);
  const substantialNotes = Boolean(notes) && (asked || bulky);
  if (substantialNotes && !(deadlines.length > 0 && !asked && trimmed.length < 180)) return "notes";
  if (deadlines.length > 0 && !question) return "deadline";
  if (question && prior && prior.points.length > 0 && trimmed.length < 400) return "followup";
  if (deadlines.length > 0) return "deadline";
  if (notes) return "notes";
  if (question) return "question";
  if (prior && prior.points.length > 0 && trimmed.length < 240) return "followup";
  return "notes";
}

function toProposals(events: DraftEvent[]): Proposal[] {
  return events.map((event) => ({
    ...event,
    id: crypto.randomUUID(),
    reminder: "day_before" as const,
    status: "pending" as const,
  }));
}

function deadlineText(events: DraftEvent[]): string {
  const bits = events.slice(0, 3).map((event) => {
    const when = formatLong(event.date);
    return event.time ? `${event.title} on ${when} at ${event.time}` : `${event.title} on ${when}`;
  });
  const extra = events.length > 3 ? ` ${events.length - 3} more are on the cards.` : "";
  return `Deadline. The useful part is ${bits.join("; ")}.${extra} Nothing is saved until you add it.`;
}

function notesText(draft: StudyDraft): string {
  const summary = deskSummary(draft.title, draft.points);
  const points = draft.points.map((point) => `• ${point}`).join("\n");
  const cards = draft.flashcards
    .slice(0, 4)
    .map((card) => `• ${card.front} → ${card.back}`)
    .join("\n");
  const practice = draft.questions.map((question, index) => `${index + 1}. ${question.prompt}`).join("\n\n");
  return `Course notes.\n${summary}\n\nHighlighted points\n${points}\n\nFlashcards\n${cards}\n\nPractice\n${practice}`;
}

export function composeDeskReply(input: { text: string; clock: WallClock; prior: PriorNotes | null }): Omit<DeskReply, "modelNote"> {
  const text = input.text.trim();
  const kind = classifyTurn(text, input.clock, input.prior);
  const deadlines = text ? parseDeadlines(text, input.clock).slice(0, 12) : [];
  if (kind === "deadline") {
    return { kind, text: deadlineText(deadlines), proposals: toProposals(deadlines), study: null };
  }
  if (kind === "followup" && input.prior) {
    const answer = answerFromNotes(text, input.prior.points, input.prior.title, input.prior.prompts);
    return {
      kind,
      text: `Follow-up, still on ${input.prior.title}.\n${answer}`,
      proposals: [],
      study: null,
    };
  }
  if (kind === "question") {
    return {
      kind,
      text: "That’s a question, and I don’t have your notes for it yet. Paste the section, or attach the photo or PDF, and I’ll pull the points from that material.",
      proposals: [],
      study: null,
    };
  }
  const draft = text ? studyFromNotes(text) : null;
  if (!draft) {
    const lead = deadlines.length
      ? deadlineText(deadlines)
      : "I couldn’t find a clear date or a set of notes in that. A line like “Essay due Nov 14”, or bullets under a heading, still works on this device.";
    return { kind: deadlines.length ? "deadline" : "notes", text: lead, proposals: toProposals(deadlines), study: null };
  }
  const note = notesText(draft);
  const withDates = deadlines.length ? `${deadlineText(deadlines)}\n\n${note}` : note;
  return { kind: "notes", text: withDates, proposals: toProposals(deadlines), study: draft };
}

export async function deskReply(input: {
  text: string;
  clock: WallClock;
  prior: PriorNotes | null;
  fileNote?: string | null;
}): Promise<DeskReply> {
  const composed = composeDeskReply(input);
  const uncovered =
    (composed.kind === "question" || composed.kind === "followup") &&
    !notesCoverQuestion(input.text, input.prior?.points ?? []);
  let text = composed.text;
  if (uncovered) {
    const fact = await lookupPublicFact(input.text);
    const aside = input.prior
      ? `Your notes don’t mention that. They still cover ${input.prior.title}.`
      : "Nothing in the saved notes covers that.";
    text = fact.ok ? `Public page. ${fact.fact} (${fact.source}).\n\n${aside}` : `${fact.message}\n\n${composed.text}`;
  } else {
    const ready = studyModelState() === "ready" ? Promise.resolve() : prepareStudyModel();
    if (studyModelState() !== "ready") {
      await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 1200))]);
    }
    if (studyModelState() === "ready" && (composed.kind === "notes" || composed.kind === "followup")) {
      const source = composed.kind === "followup" ? (input.prior?.points.join(" ") ?? "") : input.text;
      const prompt =
        composed.kind === "followup"
          ? `answer the question using only the context. context: ${source.slice(0, 600)} question: ${input.text.slice(0, 200)}`
          : `summarize: ${input.text.slice(0, 700)}`;
      const sentence = await studyModelSentence(prompt);
      if (sentence && groundedInSource(sentence, source) && !/an exam describes a new situation/i.test(sentence)) {
        text = `${text}\n\nStudy model: ${sentence}`;
      }
    }
  }
  if (input.fileNote) text = `${input.fileNote}\n\n${text}`;
  return {
    ...composed,
    text,
    modelNote: studyModelState() === "failed" ? MODEL_FAILED : null,
  };
}
