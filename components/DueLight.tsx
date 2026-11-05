"use client";

import { useEffect, useRef, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import ComingUp from "@/components/ComingUp";
import DayDetail from "@/components/DayDetail";
import MonthCalendar from "@/components/MonthCalendar";
import { extractDeadlines, readImageFile, visionEnabled } from "@/lib/client-api";
import { planReply } from "@/lib/reply";
import { notificationBody, shouldNotify } from "@/lib/reminders";
import { formatClock, isIsoDate, shanghaiNow, type WallClock } from "@/lib/shanghai";
import { loadStore, saveStore } from "@/lib/storage";
import type { CalEvent, ChatMessage, Proposal, ReminderChoice, Store } from "@/lib/types";

type View = { year: number; month: number; selected: string };

export default function DueLight() {
  const [store, setStore] = useState<Store | null>(null);
  const [clock, setClock] = useState<WallClock | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [saveWarning, setSaveWarning] = useState(false);
  const notifiedIds = useRef(new Set<string>());

  useEffect(() => {
    const now = shanghaiNow();
    setClock(now);
    setView({ year: now.year, month: now.month, selected: now.iso });
    setStore(loadStore());
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const timer = window.setInterval(() => setClock(shanghaiNow()), 15_000);
    const onVisible = () => setClock(shanghaiNow());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
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
      return {
        ...current,
        messages: current.messages.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                proposals: message.proposals?.map((proposal) =>
                  proposal.id === proposalId && proposal.status === "pending" ? { ...proposal, ...patch } : proposal,
                ),
              },
        ),
      };
    });
  }

  function addProposal(messageId: string, proposalId: string) {
    if (!store) return;
    const proposal = store.messages.find((message) => message.id === messageId)?.proposals?.find((item) => item.id === proposalId);
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
      const latest = current.messages
        .find((message) => message.id === messageId)
        ?.proposals?.find((item) => item.id === proposalId);
      if (!latest || latest.status !== "pending") return current;
      const saved: CalEvent = {
        ...event,
        title: latest.title.trim().slice(0, 80) || event.title,
        date: latest.date,
        time: latest.time,
        kind: latest.kind,
        reminder: latest.reminder,
      };
      return {
        ...current,
        events: [...current.events, saved],
        messages: current.messages.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                proposals: message.proposals?.map((item) =>
                  item.id === proposalId ? { ...item, status: "added", eventId: saved.id, title: saved.title } : item,
                ),
              },
        ),
      };
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
      return {
        ...current,
        messages: current.messages.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                proposals: message.proposals?.map((proposal) =>
                  proposal.id === proposalId ? { ...proposal, status: "discarded" } : proposal,
                ),
              },
        ),
      };
    });
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
    if (file && file.size > 3_200_000) {
      pushMessages(userMessage, assistantMessage("That photo is over 3 MB. Try a smaller one, or type the date."));
      return;
    }
    pushMessages(userMessage);
    let image = null;
    if (file) {
      try {
        image = await readImageFile(file);
      } catch {
        pushMessages(assistantMessage("I couldn't open that photo. Type the date instead."));
        return;
      }
    }
    const plan = await planReply({
      text: trimmed,
      image,
      clock: shanghaiNow(),
      vision: visionEnabled,
      extract: extractDeadlines,
    });
    pushMessages(assistantMessage(plan.text, plan.proposals));
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
          <p className="lede">Homework and tests for this browser. A refresh will not clear them.</p>
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
        />
      </div>
    </main>
  );
}

function assistantMessage(text: string, proposals: Proposal[] = []): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text,
    proposals,
    createdAt: new Date().toISOString(),
  };
}
