"use client";

import { useEffect, useRef, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import ComingUp from "@/components/ComingUp";
import DayDetail from "@/components/DayDetail";
import MonthCalendar from "@/components/MonthCalendar";
import StudyPanel from "@/components/StudyPanel";
import { MAX_FILE_BYTES, TOO_BIG_FILE } from "@/lib/document-files";
import { subscribeStudyModel } from "@/lib/local-model";
import { readDocument } from "@/lib/read-document";
import { notificationBody, shouldNotify } from "@/lib/reminders";
import { formatClock, isIsoDate, shanghaiNow, type WallClock } from "@/lib/shanghai";
import { deskReply, type PriorNotes } from "@/lib/study-agent";
import { materialiseStudy } from "@/lib/study-notes";
import { loadStore, saveStore } from "@/lib/storage";
import type { CalEvent, ChatMessage, Proposal, ReminderChoice, Store } from "@/lib/types";

type View = { year: number; month: number; selected: string };

export default function DueLight() {
  const [store, setStore] = useState<Store | null>(null);
  const [clock, setClock] = useState<WallClock | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [saveWarning, setSaveWarning] = useState(false);
  const [desk, setDesk] = useState<"calendar" | "study">("calendar");
  const [activeStudy, setActiveStudy] = useState<string | null>(null);
  const [modelLine, setModelLine] = useState("The study model is loading in this browser.");
  const notifiedIds = useRef(new Set<string>());

  useEffect(() => {
    const now = shanghaiNow();
    setClock(now);
    setView({ year: now.year, month: now.month, selected: now.iso });
    setStore(loadStore());
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const unsubscribe = subscribeStudyModel(setModelLine);
    const timer = window.setInterval(() => setClock(shanghaiNow()), 15_000);
    const onVisible = () => setClock(shanghaiNow());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!store) return;
    setSaveWarning(!saveStore(store));
  }, [store]);

  useEffect(() => {
    if (!store || perm !== "granted") return;
    const now = new Date();
    const due = store.events.filter((event) => shouldNotify(event, now) && !notifiedIds.current.has(event.id));
    if (due.length === 0) return;
    const today = (clock ?? shanghaiNow()).iso;
    for (const event of due) {
      notifiedIds.current.add(event.id);
      try {
        new Notification("Due Light", { body: notificationBody(event, today), tag: event.id });
      } catch {
        /* The coming-up list still shows the deadline. */
      }
    }
    const stamp = now.toISOString();
    const ids = new Set(due.map((event) => event.id));
    setStore((current) =>
      current
        ? {
            ...current,
            events: current.events.map((event) => (ids.has(event.id) ? { ...event, notifiedAt: stamp } : event)),
          }
        : current,
    );
  }, [store, perm, clock]);

  function shiftMonth(delta: number) {
    setView((current) => {
      if (!current || !clock) return current;
      const date = new Date(Date.UTC(current.year, current.month - 1 + delta, 1));
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      let selected = current.selected;
      if (!selected.startsWith(prefix)) {
        selected = clock.iso.startsWith(prefix) ? clock.iso : `${prefix}-01`;
      }
      return { year, month, selected };
    });
  }

  function selectDate(iso: string) {
    if (!isIsoDate(iso)) return;
    const [year, month] = iso.split("-").map(Number);
    setView({ year, month, selected: iso });
  }

  function patchEvent(id: string, patch: Partial<CalEvent>) {
    setStore((current) => {
      if (!current) return current;
      return {
        ...current,
        events: current.events.map((event) => {
          if (event.id !== id) return event;
          const next = { ...event, ...patch };
          if (typeof patch.title === "string") {
            next.title = patch.title.slice(0, 80);
          }
          if ("date" in patch || "time" in patch || "reminder" in patch) next.notifiedAt = null;
          if ("date" in patch || "time" in patch || "reminder" in patch) {
            notifiedIds.current.delete(id);
          }
          return next;
        }),
      };
    });
  }

  function updateProposal(messageId: string, proposalId: string, patch: Partial<Proposal>) {
    setStore((current) => {
      if (!current) return current;
      return mapOwnedMessage(current, messageId, (message) => ({
        ...message,
        proposals: message.proposals?.map((proposal) =>
          proposal.id === proposalId && proposal.status === "pending" ? { ...proposal, ...patch } : proposal,
        ),
      }));
    });
  }

  function addProposal(messageId: string, proposalId: string) {
    if (!store) return;
    const proposal = proposalFrom(store, messageId, proposalId);
    if (!proposal || proposal.status !== "pending") return;
    const title = proposal.title.trim();
    if (!title || !isIsoDate(proposal.date)) return;
    const event: CalEvent = {
      id: crypto.randomUUID(),
      title: title.slice(0, 80),
      date: proposal.date,
      time: proposal.time,
      kind: proposal.kind,
      reminder: proposal.reminder,
      notifiedAt: null,
      createdAt: new Date().toISOString(),
    };
    setStore((current) => {
      if (!current) return current;
      const latest = proposalFrom(current, messageId, proposalId);
      if (!latest || latest.status !== "pending") return current;
      const saved: CalEvent = {
        ...event,
        title: latest.title.trim().slice(0, 80) || event.title,
        date: latest.date,
        time: latest.time,
        kind: latest.kind,
        reminder: latest.reminder,
      };
      const next = mapOwnedMessage(current, messageId, (message) => ({
        ...message,
        proposals: message.proposals?.map((item) =>
          item.id === proposalId ? { ...item, status: "added", eventId: saved.id, title: saved.title } : item,
        ),
      }));
      return { ...next, events: [...current.events, saved] };
    });
    selectDate(proposal.date);
  }

  function addAll(messageId: string) {
    const pending = store?.messages.find((message) => message.id === messageId)?.proposals?.filter((item) => item.status === "pending") ?? [];
    for (const proposal of pending) addProposal(messageId, proposal.id);
  }

  function discardProposal(messageId: string, proposalId: string) {
    setStore((current) => {
      if (!current) return current;
      return mapOwnedMessage(current, messageId, (message) => ({
        ...message,
        proposals: message.proposals?.map((proposal) => (proposal.id === proposalId ? { ...proposal, status: "discarded" } : proposal)),
      }));
    });
  }

  function priorNotes(): PriorNotes | null {
    const latest = store?.studies[0];
    if (!latest) return null;
    return { title: latest.title, points: latest.points, prompts: latest.questions.map((question) => question.prompt) };
  }

  async function onSend(text: string, file: File | null) {
    if (!store) return;
    const trimmed = text.trim();
    if (!trimmed && !file) return;
    const createdAt = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      imageName: file?.name,
      createdAt,
    };
    if (file && file.size > MAX_FILE_BYTES) {
      pushMessages(userMessage, assistantMessage(TOO_BIG_FILE, [], "question"));
      return;
    }
    pushMessages(userMessage);
    const prior = priorNotes();
    let body = trimmed;
    let fileNote: string | null = null;
    if (file) {
      const read = await readDocument(file);
      if (!read.ok) {
        if (!trimmed) {
          pushMessages(assistantMessage(read.message, [], "question"));
          return;
        }
        fileNote = read.message;
      } else {
        body = [trimmed, read.text].filter(Boolean).join("\n");
      }
    }
    const reply = await deskReply({ text: body, clock: shanghaiNow(), prior, fileNote });
    const lead = file && !fileNote ? "I read the file in this browser. " : "";
    const message = assistantMessage(`${lead}${reply.text}`, reply.proposals, reply.kind);
    if (!reply.study) {
      pushMessages(message);
      return;
    }
    const set = materialiseStudy(reply.study, file && !fileNote ? "photo" : "notes");
    message.studySetId = set.id;
    setStore((current) =>
      current
        ? {
            ...current,
            studies: [set, ...(current.studies ?? [])].slice(0, 30),
            messages: [...current.messages, message].slice(-40),
          }
        : current,
    );
    setActiveStudy(set.id);
  }

  function openStudy(id?: string) {
    setDesk("study");
    if (id) {
      setActiveStudy(id);
      return;
    }
    setActiveStudy((current) => current ?? store?.studies[0]?.id ?? null);
  }

  async function onStudySend(text: string, file: File | null) {
    if (!store) return;
    const trimmed = text.trim();
    if (!trimmed && !file) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      imageName: file?.name,
      createdAt: new Date().toISOString(),
    };
    if (file && file.size > MAX_FILE_BYTES) {
      pushStudy(userMessage, assistantMessage(TOO_BIG_FILE, [], "question"));
      return;
    }
    pushStudy(userMessage);
    const prior = priorNotes();
    let body = trimmed;
    let fileNote: string | null = null;
    if (file) {
      const read = await readDocument(file);
      if (!read.ok) {
        if (!trimmed) {
          pushStudy(assistantMessage(read.message, [], "question"));
          return;
        }
        fileNote = read.message;
      } else {
        body = [trimmed, read.text].filter(Boolean).join("\n");
      }
    }
    const reply = await deskReply({ text: body, clock: shanghaiNow(), prior, fileNote });
    const lead = file && !fileNote ? "I read the file in this browser. " : "";
    const message = assistantMessage(`${lead}${reply.text}`, reply.proposals, reply.kind);
    if (!reply.study) {
      pushStudy(message);
      return;
    }
    const set = materialiseStudy(reply.study, file && !fileNote ? "photo" : "notes");
    message.studySetId = set.id;
    setStore((current) =>
      current
        ? {
            ...current,
            studies: [set, ...(current.studies ?? [])].slice(0, 30),
            studyMessages: [...(current.studyMessages ?? []), message].slice(-40),
          }
        : current,
    );
    setActiveStudy(set.id);
  }

  function pushStudy(...items: ChatMessage[]) {
    setStore((current) =>
      current ? { ...current, studyMessages: [...(current.studyMessages ?? []), ...items].slice(-40) } : current,
    );
  }

  function pushMessages(...items: ChatMessage[]) {
    setStore((current) => (current ? { ...current, messages: [...current.messages, ...items].slice(-40) } : current));
  }

  async function enableReminders() {
    if (typeof Notification === "undefined") {
      setPerm("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setPerm(result);
  }

  if (!store || !clock || !view) {
    return (
      <main className="shell">
        <h1 className="wordmark">Due Light</h1>
        <p className="lede">Opening your calendar…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1 className="wordmark">Due Light</h1>
          <p className="lede">Deadlines and revision for this browser. A refresh will not clear them.</p>
        </div>
        <div className="top-side">
          <p className="clock">{formatClock(clock)}</p>
          {perm === "granted" ? (
            <p className="status">Reminders on while this tab is open</p>
          ) : perm === "denied" ? (
            <p className="status">Reminders are blocked in the browser settings. Today and tomorrow still show below.</p>
          ) : perm === "unsupported" ? (
            <p className="status">This browser does not show notification popups. Today and tomorrow still show below.</p>
          ) : (
            <button id="reminders" type="button" className="remind-btn" onClick={() => void enableReminders()}>
              Turn on reminders
            </button>
          )}
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="Due Light">
        <button id="tab-calendar" type="button" role="tab" aria-selected={desk === "calendar"} onClick={() => setDesk("calendar")}>
          Calendar
        </button>
        <button id="tab-study" type="button" role="tab" aria-selected={desk === "study"} onClick={() => openStudy()}>
          Study
        </button>
      </div>
      {saveWarning ? (
        <p className="save-warning" role="status">
          This browser blocked saving. A refresh may clear the calendar.
        </p>
      ) : null}
      <ComingUp
        events={store.events}
        today={clock.iso}
        onReminder={(id, reminder: ReminderChoice) => patchEvent(id, { reminder })}
      />
      {desk === "study" ? (
        <StudyPanel
          messages={store.studyMessages ?? []}
          studies={store.studies}
          activeId={activeStudy}
          modelLine={modelLine}
          onSend={onStudySend}
          onUpdateProposal={updateProposal}
          onAdd={addProposal}
          onDiscard={discardProposal}
          onSelect={setActiveStudy}
          onRemove={(id) => {
            setStore((current) => (current ? { ...current, studies: current.studies.filter((set) => set.id !== id) } : current));
            setActiveStudy((current) => (current === id ? null : current));
          }}
          onKnown={(setId, cardId) =>
            setStore((current) =>
              current
                ? {
                    ...current,
                    studies: current.studies.map((set) =>
                      set.id !== setId
                        ? set
                        : {
                            ...set,
                            flashcards: set.flashcards.map((card) => (card.id === cardId ? { ...card, known: !card.known } : card)),
                          },
                    ),
                  }
                : current,
            )
          }
        />
      ) : (
      <div className="board">
        <div>
          <MonthCalendar
            year={view.year}
            month={view.month}
            selected={view.selected}
            today={clock.iso}
            events={store.events}
            onSelect={selectDate}
            onShift={shiftMonth}
            onToday={() => selectDate(clock.iso)}
          />
          <DayDetail
            selected={view.selected}
            events={store.events}
            onPatch={patchEvent}
            onRemove={(id) =>
              setStore((current) => (current ? { ...current, events: current.events.filter((event) => event.id !== id) } : current))
            }
            onSelectDate={selectDate}
          />
        </div>
        <ChatPanel
          messages={store.messages}
          onSend={onSend}
          onUpdateProposal={updateProposal}
          onAdd={addProposal}
          onDiscard={discardProposal}
          onAddAll={addAll}
          onOpenStudy={openStudy}
          modelLine={modelLine}
        />
      </div>
      )}
    </main>
  );
}

function proposalFrom(current: Store, messageId: string, proposalId: string): Proposal | undefined {
  for (const list of [current.messages, current.studyMessages ?? []]) {
    const proposal = list.find((message) => message.id === messageId)?.proposals?.find((item) => item.id === proposalId);
    if (proposal) return proposal;
  }
  return undefined;
}

function mapOwnedMessage(current: Store, messageId: string, update: (message: ChatMessage) => ChatMessage): Store {
  if (current.messages.some((message) => message.id === messageId)) {
    return { ...current, messages: current.messages.map((message) => (message.id === messageId ? update(message) : message)) };
  }
  return {
    ...current,
    studyMessages: (current.studyMessages ?? []).map((message) => (message.id === messageId ? update(message) : message)),
  };
}

function assistantMessage(text: string, proposals: Proposal[] = [], kind?: ChatMessage["kind"]): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text,
    proposals,
    kind,
    createdAt: new Date().toISOString(),
  };
}
