import { formatLong, formatMonth, monthGrid, WEEKDAY_LABELS } from "@/lib/shanghai";
import type { CalEvent } from "@/lib/types";

export default function MonthCalendar({
  year,
  month,
  selected,
  today,
  events,
  onSelect,
  onShift,
  onToday,
}: {
  year: number;
  month: number;
  selected: string;
  today: string;
  events: CalEvent[];
  onSelect: (iso: string) => void;
  onShift: (delta: number) => void;
  onToday: () => void;
}) {
  const cells = monthGrid(year, month);
  const inMonth = events.filter((event) => event.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)).length;
  return (
    <section className="card calendar-card" id="calendar" aria-label="Month calendar">
      <div className="month-bar">
        <h2>{formatMonth(year, month)}</h2>
        <div className="month-actions">
          <button type="button" className="ghost" onClick={() => onShift(-1)} aria-label="Previous month">
            Prev
          </button>
          <button type="button" className="ghost" onClick={onToday}>
            Today
          </button>
          <button type="button" className="ghost" onClick={() => onShift(1)} aria-label="Next month">
            Next
          </button>
        </div>
      </div>
      <p className="meta">{inMonth === 0 ? "Nothing marked this month." : `${inMonth} marked this month.`}</p>
      <div className="legend">
        <span><i className="mark-homework" /> Homework</span>
        <span><i className="mark-test" /> Test</span>
      </div>
      <div className="weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid" role="group" aria-label={formatMonth(year, month)}>
        {cells.map((iso, index) => {
          if (!iso) return <span key={`blank-${index}`} />;
          const dayEvents = events.filter((event) => event.date === iso);
          const homework = dayEvents.some((event) => event.kind === "homework");
          const test = dayEvents.some((event) => event.kind === "test");
          const countLabel = dayEvents.length === 1 ? "1 deadline" : `${dayEvents.length} deadlines`;
          return (
            <button
              key={iso}
              type="button"
              className="day"
              data-date={iso}
              data-count={dayEvents.length}
              data-today={iso === today}
              data-selected={iso === selected}
              aria-pressed={iso === selected}
              aria-label={`${formatLong(iso)}, ${countLabel}`}
              onClick={() => onSelect(iso)}
            >
              <span className="num">{Number(iso.slice(-2))}</span>
              <span className="marks" aria-hidden="true">
                {homework ? <span className="mark mark-homework" /> : null}
                {test ? <span className="mark mark-test" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
