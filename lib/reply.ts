import { parseDeadlines } from "./parse-deadlines";
import type { WallClock } from "./shanghai";
import type { DraftEvent, ExtractResult, ImagePayload, Proposal } from "./types";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type ReplyPlan = {
  text: string;
  proposals: Proposal[];
};

function countPhrase(count: number): string {
  return count === 1 ? "1 date" : `${count} dates`;
}

function toProposals(events: DraftEvent[]): Proposal[] {
  return events.map((event) => ({
    ...event,
    id: crypto.randomUUID(),
    reminder: "day_before" as const,
    status: "pending" as const,
  }));
}

function foundText(events: DraftEvent[]): string {
  const extra = events.length >= 12 ? " I stopped at 12. Send the rest in another note." : "";
  const pronoun = events.length === 1 ? "it" : "them";
  const add = events.length === 1 ? "it" : "the ones you want";
  return `I found ${countPhrase(events.length)}. Check ${pronoun}, then add ${add}.${extra}`;
}

export async function planReply(input: {
  text: string;
  image: ImagePayload | null;
  clock: WallClock;
  vision: () => Promise<boolean>;
  extract: (body: { text?: string; image?: { mime: string; data: string } }) => Promise<ExtractResult>;
}): Promise<ReplyPlan> {
  const text = input.text.trim();
  const local = text ? parseDeadlines(text, input.clock).slice(0, 12) : [];
  if (input.image && !IMAGE_TYPES.has(input.image.mime)) {
    const lead = local.length
      ? `${foundText(local)} That file is not a JPEG, PNG, WEBP, or GIF, so the photo was not read.`
      : "Please use a JPEG, PNG, WEBP, or GIF photo. You can also type the date, for example “Quiz Friday 10am”.";
    return { text: lead, proposals: toProposals(local) };
  }
  if (input.image) {
    let vision = false;
    try {
      vision = await input.vision();
    } catch {
      vision = false;
    }
    if (!vision) {
      if (local.length) {
        return {
          text: `${foundText(local)} The photo was not read. Add an OpenAI key named OPENAI_API_KEY to read pictures. Nothing from the photo was saved.`,
          proposals: toProposals(local),
        };
      }
      return {
        text: "I can't read that photo yet. Add an OpenAI key named OPENAI_API_KEY for this app. Nothing from the picture was saved. Type the date instead, for example “Biology quiz Friday 10:00”, and it will still save.",
        proposals: [],
      };
    }
    let result: ExtractResult;
    try {
      result = await input.extract({
        text,
        image: { mime: input.image.mime, data: input.image.base64 },
      });
    } catch {
      result = {
        ok: false,
        reason: "upstream",
        message: "I couldn't reach the reader. Typed dates still work when the day is clear.",
      };
    }
    if (result.ok && result.events.length > 0) {
      const events = result.events.slice(0, 12);
      return { text: foundText(events), proposals: toProposals(events) };
    }
    if (local.length) {
      const reason = result.ok ? "I couldn't find dates in the photo, so I used the typed words." : result.message;
      return { text: `${reason} ${foundText(local)}`, proposals: toProposals(local) };
    }
    return {
      text: result.ok
        ? "I couldn't find a deadline in that. Try a line like “Essay due Nov 14”."
        : result.message,
      proposals: [],
    };
  }
  if (local.length) return { text: foundText(local), proposals: toProposals(local) };
  if (!text) return { text: "Add a due date or a photo.", proposals: [] };
  let result: ExtractResult;
  try {
    result = await input.extract({ text });
  } catch {
    return {
      text: "I couldn't find a clear date, and the reader didn't answer. Try “Essay due Nov 14” or “Quiz Friday 10am”.",
      proposals: [],
    };
  }
  if (result.ok && result.events.length > 0) {
    const events = result.events.slice(0, 12);
    return { text: foundText(events), proposals: toProposals(events) };
  }
  return {
    text: result.ok
      ? "I couldn't find a deadline in that. Try a line like “Essay due Nov 14”."
      : result.message,
    proposals: [],
  };
}
