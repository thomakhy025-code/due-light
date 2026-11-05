import assert from "node:assert/strict";
import test from "node:test";
import { eventEndInstant, reminderInstant, shouldNotify } from "./reminders";
import { monthGrid, shanghaiNow } from "./shanghai";

const event = {
  date: "2026-11-14",
  time: "09:30",
  reminder: "day_before" as const,
  notifiedAt: null,
};

test("day-before reminder is 8:00 Asia/Shanghai the previous day", () => {
  assert.equal(reminderInstant(event)?.toISOString(), "2026-11-13T00:00:00.000Z");
  assert.equal(reminderInstant({ ...event, reminder: "morning_of" })?.toISOString(), "2026-11-14T00:00:00.000Z");
  assert.equal(reminderInstant({ ...event, reminder: "two_days" })?.toISOString(), "2026-11-12T00:00:00.000Z");
  assert.equal(reminderInstant({ ...event, reminder: "week_before" })?.toISOString(), "2026-11-07T00:00:00.000Z");
  assert.equal(reminderInstant({ ...event, reminder: "at_time" })?.toISOString(), "2026-11-14T01:30:00.000Z");
  assert.equal(reminderInstant({ ...event, reminder: "none" }), null);
});

test("notifies only inside the open window and only once", () => {
  const before = new Date("2026-11-12T23:59:00.000Z");
  const at = new Date("2026-11-13T00:00:00.000Z");
  const during = new Date("2026-11-13T06:00:00.000Z");
  const after = new Date("2026-11-14T03:30:00.000Z");
  assert.equal(shouldNotify(event, before), false);
  assert.equal(shouldNotify(event, at), true);
  assert.equal(shouldNotify(event, during), true);
  assert.equal(eventEndInstant(event).toISOString(), "2026-11-14T03:30:00.000Z");
  assert.equal(shouldNotify(event, after), false);
  assert.equal(shouldNotify({ ...event, notifiedAt: at.toISOString() }, during), false);
});

test("Shanghai clock and Monday-first November 2026", () => {
  const evening = shanghaiNow(new Date("2026-11-05T15:28:00.000Z"));
  assert.equal(evening.iso, "2026-11-05");
  assert.equal(evening.hour, 23);
  assert.equal(evening.minute, 28);
  const midnight = shanghaiNow(new Date("2026-11-05T16:00:00.000Z"));
  assert.equal(midnight.iso, "2026-11-06");
  assert.equal(midnight.hour, 0);
  const cells = monthGrid(2026, 11);
  assert.equal(cells[6], "2026-11-01");
  assert.equal(cells[10], "2026-11-05");
  assert.equal(cells.filter(Boolean).length, 30);
});
