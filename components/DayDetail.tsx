import { useState } from "react";
import { compareEvents, REMINDER_OPTIONS } from "@/lib/reminders";
import { formatLong, formatTime, isIsoDate } from "@/lib/shanghai";
import type { CalEvent, Kind, ReminderChoice } from "@/lib/types";

export default function DayDetail({
  selected,
  events,
  onPatch,
  onRemove,
  onSelectDate,
}: {
  selected: string;
  events: CalEvent[];
  onPatch: (id: string, patch: Partial<CalEvent>) => void;
  onRemove: (id: string) => void;
  onSelectDate: (iso: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const list = events.filter((event) => event.date === selected).sort(compareEvents);
  return (
    <section className="card day-card" aria-label="Selected day">
      <h3>{formatLong(selected)}</h3>
      {list.length === 0 ? (
        <p className="quiet">No deadlines on this day.</p>
      ) : (
        list.map((event) => (
          <article key={event.id} className="event-row" data-event-id={event.id}>
            <div className="event-head">
              <p className={`kind kind-${event.kind}`}>{event.kind === "test" ? "Test" : "Homework"}</p>
              <p className="meta">{event.time ? formatTime(event.time) : "Any time"}</p>
            </div>
            <div className="fields">
              <label className="field wide">
                Title
                <input
                  value={event.title}
                  aria-label={`Title for ${event.title}`}
                  onChange={(change) => onPatch(event.id, { title: change.target.value })}
                />
              </label>
              <label className="field">
                Date
                <input
                  type="date"
                  value={event.date}
                  onChange={(change) => {
                    if (!isIsoDate(change.target.value)) return;
                    onPatch(event.id, { date: change.target.value });
                    onSelectDate(change.target.value);
                  }}
                />
              </label>
              <label className="field">
                Time
                <input
                  type="time"
                  value={event.time ?? ""}
                  onChange={(change) => onPatch(event.id, { time: change.target.value || null })}
                />
              </label>
              <div className="field wide">
                <span>Kind</span>
                <div className="segment">
                  {(["homework", "test"] as Kind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      data-kind={kind}
                      aria-pressed={event.kind === kind}
                      onClick={() => onPatch(event.id, { kind })}
                    >
                      {kind === "test" ? "Test" : "Homework"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field wide">
                Reminder
                <select
                  value={event.reminder}
                  aria-label={`Reminder for ${event.title}`}
                  onChange={(change) => onPatch(event.id, { reminder: change.target.value as ReminderChoice })}
                >
                  {REMINDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {confirmId === event.id ? (
              <div className="row-actions">
                <button type="button" className="danger" onClick={() => onRemove(event.id)}>
                  Yes, remove
                </button>
                <button type="button" className="ghost" onClick={() => setConfirmId(null)}>
                  Keep
                </button>
              </div>
            ) : (
              <div className="row-actions">
                <button type="button" className="danger" onClick={() => setConfirmId(event.id)}>
                  Remove
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}
