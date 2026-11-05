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
  studySetId?: string;
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

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  known: boolean;
};

export type PracticeQuestion = {
  id: string;
  prompt: string;
  approach: string;
};

export type StudySet = {
  id: string;
  title: string;
  points: string[];
  flashcards: Flashcard[];
  questions: PracticeQuestion[];
  source: "notes" | "photo" | "model";
  createdAt: string;
};

export type StudyDraft = {
  title: string;
  points: string[];
  flashcards: Array<{ front: string; back: string }>;
  questions: Array<{ prompt: string; approach: string }>;
};

export type Store = {
  userId: string;
  events: CalEvent[];
  messages: ChatMessage[];
  studies: StudySet[];
};

export type ExtractSuccess = { ok: true; events: DraftEvent[] };
export type ExtractFailure = { ok: false; reason: string; message: string };
export type ExtractResult = ExtractSuccess | ExtractFailure;

export type StudySuccess = { ok: true; study: StudyDraft };
export type StudyResult = StudySuccess | ExtractFailure;

export type ImagePayload = {
  name: string;
  mime: string;
  base64: string;
};
