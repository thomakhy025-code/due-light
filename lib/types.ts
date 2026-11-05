export type Kind = "homework" | "test";

export type ReminderChoice =
  | "day_before"
  | "morning_of"
  | "two_days"
  | "week_before"
  | "at_time"
  | "none";

export type DraftEvent = {
  title: string;
  date: string;
  time: string | null;
  kind: Kind;
  sourceText: string;
};

export type Proposal = DraftEvent & {
  id: string;
  reminder: ReminderChoice;
  status: "pending" | "added" | "discarded";
  eventId?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageName?: string;
  proposals?: Proposal[];
  createdAt: string;
};

export type CalEvent = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  kind: Kind;
  reminder: ReminderChoice;
  notifiedAt: string | null;
  createdAt: string;
};

export type Store = {
  userId: string;
  events: CalEvent[];
  messages: ChatMessage[];
};

export type ExtractSuccess = { ok: true; events: DraftEvent[] };
export type ExtractFailure = { ok: false; reason: string; message: string };
export type ExtractResult = ExtractSuccess | ExtractFailure;

export type ImagePayload = {
  name: string;
  mime: string;
  base64: string;
};
