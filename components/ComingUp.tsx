import { compareEvents, REMINDER_OPTIONS, shouldNotify } from "@/lib/reminders";
import { dayRelation, formatTime } from "@/lib/shanghai";
import type { CalEvent, ReminderChoice } from "@/lib/types";

export default function ComingUp({
  events,
  today,
  onReminder,
}: {
  events: CalEvent[];
  today: string;
  onReminder: (id: string, reminder: ReminderChoice) => void;
}) {
  const tomorrow = events
    .filter((event) => dayRelation(event.date, today))
    .sort(compareEvents);
  const now = new Date();
  return (
    <section className="upcoming-wrap" id="coming-up" aria-label="Coming up">
      <h2 className="section-label">Coming up</h2>
      {tomorrow.length === 0 ? (
        <p className="quiet">Nothing today or tomorrow. Later dates still show on the calendar.</p>
      ) : (
        <div className="upcoming">
          {tomorrow.map((event) => {
            const due = shouldNotify(event, now);
            return (
              <article key={event.id} className="card up-card" data-due={due} data-event-id={event.id}>
                <p className="when">{dayRelation(event.date, today)}</p>
                <h3>{event.title}</h3>
                <p className="meta">{event.time ? formatTime(event.time) : "Any time"}</p>
                {due ? <p className="due-flag">Reminder due</p> : null}
                <label className="field">
                  Reminder
                  <select
                    aria-label={`Reminder for ${event.title}`}
                    value={event.reminder}
                    onChange={(change) => onReminder(event.id, change.target.value as ReminderChoice)}
                  >
                    {REMINDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
