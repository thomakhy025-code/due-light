import type { StudyDraft, StudySet } from "./types";

export const SAMPLE_NOTES = `Cell respiration
- Glycolysis splits glucose into pyruvate in the cytoplasm and does not need oxygen.
- The Krebs cycle turns pyruvate into carbon dioxide in the mitochondria.
- The electron transport chain uses oxygen to make most of the ATP.

Osmosis: water moves across a membrane from a dilute solution to a more concentrated one.`;

const STUDY_INTENT =
  /(?:^|\b(?:please|can you|could you)\s+)(?:summari[sz]e|make flash\s?cards|make cards|study these|study this|revise this)\b|\b(?:summari[sz]e|flash\s?cards?|revision cards|summary of (?:these|this|the|my))\b/i;

const RAMBLE = /\b(idk|kinda|sorta|sort of|stuff|things?|maybe|i think|i guess|dunno|lol)\b/i;

const RECALL_ONLY = /^\s*(what is|what are|what's|define|who is|who was|when did|list the|name the)\b/i;

export function asksToStudy(text: string): boolean {
  return STUDY_INTENT.test(text);
}

export function stripStudyLead(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(
      /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:summari[sz]e|make flash\s?cards(?: from)?|make cards from|study|revise)\b(?:\s+(?:these|this|the following|my))?(?:\s+notes)?\s*[:\-]?\s*/i,
      "",
    )
    .trim();
}

function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function splitDefinition(line: string): { term: string; meaning: string } | null {
  const chosen = /^(.{2,60}?)\s*(?::|—|–)\s+(.{8,})$/.exec(line) ?? /^(.{2,48}?)\s+-\s+(.{8,})$/.exec(line);
  if (!chosen) return null;
  const term = clean(chosen[1], 60);
  const meaning = clean(chosen[2], 240);
  if (!term || !meaning || term.split(/\s+/).length > 8) return null;
  if (/^(?:the|a|an|this|it|so|and|but|please|note|notes|summary|today)\b/i.test(term)) return null;
  if (/^(?:chapter|section|topic|week|lecture)\b/i.test(term)) return null;
  return { term, meaning };
}

function isHeadingLine(line: string): boolean {
  const bare = line.replace(/:$/, "").trim();
  if (bare.length < 3 || bare.length > 48) return false;
  if (/[.?!]$/.test(bare)) return false;
  if (/^(?:[-*•]|\d+[.)])\s/.test(line)) return false;
  return bare.split(/\s+/).length <= 6;
}

type ParsedItem =
  | { kind: "definition"; term: string; meaning: string }
  | { kind: "point"; text: string };

function parseStructured(text: string): { title: string; items: ParsedItem[] } {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let title = "";
  let heading = "";
  const items: ParsedItem[] = [];
  for (const line of lines) {
    const markdown = /^#{1,3}\s+(.+)/.exec(line);
    if (markdown) {
      heading = clean(markdown[1], 48);
      if (!title) title = heading;
      continue;
    }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line);
    const source = clean(bullet ? bullet[1] : line, 240);
    if (!source) continue;
    const defined = splitDefinition(source);
    if (defined) {
      items.push({ kind: "definition", ...defined });
      continue;
    }
    if (bullet) {
      items.push({ kind: "point", text: heading && heading !== title ? `${heading}: ${source}` : source });
      continue;
    }
    if (isHeadingLine(line)) {
      heading = clean(line.replace(/:$/, ""), 48);
      if (!title) title = heading;
      continue;
    }
    if (heading && source.length >= 40) {
      items.push({ kind: "point", text: heading === title ? source : `${heading}: ${source}` });
      heading = "";
    }
  }
  return { title, items };
}

function prosePoints(text: string): string[] {
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => clean(sentence, 240))
    .filter((sentence) => sentence.length >= 40 && sentence.split(/\s+/).length >= 6);
  if (sentences.length < 2) return [];
  const rambles = sentences.filter((sentence) => RAMBLE.test(sentence));
  if (rambles.length * 2 >= sentences.length) return [];
  return sentences.filter((sentence) => !RAMBLE.test(sentence)).slice(0, 6);
}

function cueFromPoint(text: string): string {
  const verb = /\b(is|are|was|were|splits|uses|turns|moves|makes|does|needs|releases|happens|means|converts|produces|requires|captures)\b/i.exec(text);
  if (verb && verb.index >= 3 && verb.index <= 48) return clean(text.slice(0, verb.index), 48);
  const words = text.split(/\s+/).slice(0, 6).join(" ");
  return words.length < text.length ? `${words}…` : words;
}

function applicationQuestions(points: string[]): Array<{ prompt: string; approach: string }> {
  const templates = [
    (point: string) => ({
      prompt: `An exam describes a new situation you have not revised. How would you apply this idea, and what result would you expect?\n\nIdea: ${point}`,
      approach: `Name the clue in the new situation that matches the idea. Say what you would predict or do because of that clue, and what would change if the clue were missing. Do not stop at restating the idea.`,
    }),
    (point: string) => ({
      prompt: `You have to choose what to do in a fresh example. Which part of this idea decides your choice, and what would you do next?\n\nIdea: ${point}`,
      approach: `Turn the idea into a rule you can test. Match one detail of the example to that rule, state the choice, and name the mistake you would make if you ignored that detail.`,
    }),
    (point: string) => ({
      prompt: `A marker asks you to use this knowledge, not only recall it. Sketch a short case and show the step where the idea changes the answer.\n\nIdea: ${point}`,
      approach: `Write one sentence of situation and two of application. The answer should end with an outcome: what happens, or what you would decide, because of the idea.`,
    }),
  ];
  const questions = points.slice(0, 3).map((point, index) => templates[index % templates.length](point));
  if (points.length >= 2) {
    questions.unshift({
      prompt: `A question asks you to choose between two ideas for a new situation. How do you decide which one applies, and what is the first step after you choose?\n\nFirst idea: ${points[0]}\nSecond idea: ${points[1]}`,
      approach: `State the job of each idea in a few words. Match one detail in the situation to one job. Write the choice, the reason, and the next step. Then say what would go wrong if you picked the other idea.`,
    });
  }
  return questions.slice(0, 4);
}

function isRecallOnly(prompt: string): boolean {
  return RECALL_ONLY.test(prompt.replace(/\s+/g, " ").trim());
}

export function withApplicationQuestions(draft: StudyDraft): StudyDraft {
  const kept = draft.questions.filter((question) => question.prompt && question.approach && !isRecallOnly(question.prompt));
  if (kept.length >= 2) return { ...draft, questions: kept.slice(0, 4) };
  const extra = applicationQuestions(draft.points);
  const questions = [...kept, ...extra].slice(0, 4);
  return { ...draft, questions };
}

function draftFromItems(title: string, items: ParsedItem[]): StudyDraft | null {
  const points: string[] = [];
  const flashcards: Array<{ front: string; back: string }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.kind === "definition") {
      const point = `${item.term}: ${item.meaning}`;
      const key = point.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(point);
      flashcards.push({ front: item.term, back: item.meaning });
      continue;
    }
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(item.text);
    flashcards.push({ front: cueFromPoint(item.text), back: item.text });
    if (points.length >= 8) break;
  }
  if (points.length < 2) return null;
  const draft: StudyDraft = {
    title: title || cueFromPoint(points[0]) || "Course notes",
    points: points.slice(0, 8),
    flashcards: flashcards.slice(0, 8),
    questions: [],
  };
  return withApplicationQuestions(draft);
}

export function studyFromNotes(text: string): StudyDraft | null {
  const body = stripStudyLead(text).normalize("NFKC").replace(/：/g, ":").trim();
  if (body.length < 40) return null;
  const structured = parseStructured(body);
  const fromStructure = draftFromItems(structured.title, structured.items);
  if (fromStructure) return fromStructure;
  const prose = prosePoints(body);
  if (prose.length < 2) return null;
  return draftFromItems("", prose.map((text) => ({ kind: "point", text })));
}

export function studyFromModelPayload(payload: unknown): StudyDraft | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const points = Array.isArray(record.points)
    ? record.points.map((item) => (typeof item === "string" ? clean(item, 240) : "")).filter(Boolean).slice(0, 8)
    : [];
  const flashcards = Array.isArray(record.flashcards)
    ? record.flashcards
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const card = item as Record<string, unknown>;
          const front = typeof card.front === "string" ? clean(card.front, 120) : "";
          const back = typeof card.back === "string" ? clean(card.back, 400) : "";
          if (!front || !back) return null;
          return { front, back };
        })
        .filter((item): item is { front: string; back: string } => item !== null)
        .slice(0, 8)
    : [];
  const questions = Array.isArray(record.questions)
    ? record.questions
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const question = item as Record<string, unknown>;
          const prompt = typeof question.prompt === "string" ? clean(question.prompt, 500) : "";
          const approach = typeof question.approach === "string" ? clean(question.approach, 500) : "";
          if (!prompt || !approach) return null;
          return { prompt, approach };
        })
        .filter((item): item is { prompt: string; approach: string } => item !== null)
        .slice(0, 6)
    : [];
  const title = typeof record.title === "string" ? clean(record.title, 80) : "";
  if (points.length < 2 && flashcards.length < 2) return null;
  const pointList = points.length >= 2 ? points : flashcards.map((card) => `${card.front}: ${card.back}`);
  return withApplicationQuestions({
    title: title || cueFromPoint(pointList[0]) || "Course notes",
    points: pointList.slice(0, 8),
    flashcards: (flashcards.length > 0 ? flashcards : pointList.map((point) => ({ front: cueFromPoint(point), back: point }))).slice(0, 8),
    questions,
  });
}

export function studyFromModelContent(content: string): StudyDraft | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return studyFromModelPayload(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function materialiseStudy(draft: StudyDraft, source: StudySet["source"]): StudySet {
  return {
    id: crypto.randomUUID(),
    title: draft.title,
    points: draft.points,
    flashcards: draft.flashcards.map((card) => ({ ...card, id: crypto.randomUUID(), known: false })),
    questions: draft.questions.map((question) => ({ ...question, id: crypto.randomUUID() })),
    source,
    createdAt: new Date().toISOString(),
  };
}
