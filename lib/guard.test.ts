import assert from "node:assert/strict";
import test from "node:test";
import { draftsFromModelContent } from "./model-events";
import { allowRequest, createRateState } from "./rate-limit";
import { clientAddress, isAllowedExtractRequest } from "./extract-guard";
import type { WallClock } from "./shanghai";
import { loadStore, saveStore } from "./storage";

const clock: WallClock = {
  year: 2026,
  month: 11,
  day: 5,
  hour: 12,
  minute: 0,
  weekday: "Thu",
  iso: "2026-11-05",
};

test("extract requests need the app header and cannot be cross-site", () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  });
  assert.equal(isAllowedExtractRequest(headers({ "x-due-light": "1" })), true);
  assert.equal(isAllowedExtractRequest(headers({ "x-due-light": "1", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isAllowedExtractRequest(headers({ "sec-fetch-site": "same-origin" })), false);
  assert.equal(isAllowedExtractRequest(headers({ "x-due-light": "1", "sec-fetch-site": "cross-site" })), false);
  assert.equal(clientAddress(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
});

test("rate limit stops a burst and allows another minute", () => {
  const state = createRateState();
  const limits = { perMinute: 2, perHour: 10, globalPerHour: 10 };
  const now = 1_700_000_000_000;
  assert.equal(allowRequest(state, "a", now, limits), true);
  assert.equal(allowRequest(state, "a", now + 1000, limits), true);
  assert.equal(allowRequest(state, "a", now + 2000, limits), false);
  assert.equal(allowRequest(state, "b", now + 2000, limits), true);
  assert.equal(allowRequest(state, "a", now + 61_000, limits), true);
});

test("model JSON is validated before it can be saved", () => {
  const events = draftsFromModelContent(
    '```json\n{"events":[{"title":"Lab quiz","date":"2026-11-18","time":"9:15 am","kind":"quiz"},{"title":"Nope","date":"yesterdayish","time":null,"kind":"homework"}]}\n```',
    clock,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.title, "Lab quiz");
  assert.equal(events[0]?.date, "2026-11-18");
  assert.equal(events[0]?.time, "09:15");
  assert.equal(events[0]?.kind, "test");
});

test("events persist for one anonymous browser id", () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
      clear: () => memory.clear(),
    },
  });
  const first = loadStore();
  assert.equal(first.events.length, 0);
  const saved = saveStore({
    userId: first.userId,
    events: [
      {
        id: "evt-1",
        title: "Essay",
        date: "2026-11-14",
        time: null,
        kind: "homework",
        reminder: "day_before",
        notifiedAt: null,
        createdAt: "2026-11-05T00:00:00.000Z",
      },
    ],
    messages: [],
  });
  assert.equal(saved, true);
  const again = loadStore();
  assert.equal(again.userId, first.userId);
  assert.equal(again.events[0]?.title, "Essay");
  memory.set(`due-light.v1.${first.userId}`, "{");
  const recovered = loadStore();
  assert.equal(recovered.userId, first.userId);
  assert.equal(recovered.events.length, 0);
});
