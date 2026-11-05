import assert from "node:assert/strict";
import test from "node:test";
import { planReply } from "./reply";
import type { WallClock } from "./shanghai";
import type { ExtractResult } from "./types";

const clock: WallClock = {
  year: 2026,
  month: 11,
  day: 5,
  hour: 15,
  minute: 0,
  weekday: "Thu",
  iso: "2026-11-05",
};

test("clear typed dates never call the model", async () => {
  let called = 0;
  const reply = await planReply({
    text: "Math homework due Nov 14",
    image: null,
    clock,
    vision: async () => {
      throw new Error("vision should not be checked");
    },
    extract: async () => {
      called += 1;
      return { ok: false, reason: "no_key", message: "no" };
    },
  });
  assert.equal(called, 0);
  assert.equal(reply.proposals.length, 1);
  assert.equal(reply.proposals[0]?.date, "2026-11-14");
  assert.equal(reply.proposals[0]?.status, "pending");
  assert.equal(reply.proposals[0]?.reminder, "day_before");
});

test("a photo with no key is explained and not uploaded", async () => {
  let extracted = 0;
  const reply = await planReply({
    text: "",
    image: { name: "sheet.jpg", mime: "image/jpeg", base64: "aaaa" },
    clock,
    vision: async () => false,
    extract: async () => {
      extracted += 1;
      return { ok: true, events: [] };
    },
  });
  assert.equal(extracted, 0);
  assert.match(reply.text, /OPENAI_API_KEY/);
  assert.equal(reply.proposals.length, 0);
});

test("typed dates still return when a photo cannot be read", async () => {
  const reply = await planReply({
    text: "Essay due tomorrow",
    image: { name: "sheet.png", mime: "image/png", base64: "aaaa" },
    clock,
    vision: async () => false,
    extract: async () => {
      throw new Error("should not extract");
    },
  });
  assert.equal(reply.proposals[0]?.date, "2026-11-06");
  assert.match(reply.text, /photo was not read/i);
});

test("messy text uses the model result when a key exists", async () => {
  const result: ExtractResult = {
    ok: true,
    events: [
      { title: "Chem worksheet", date: "2026-11-18", time: null, kind: "homework", sourceText: "model" },
    ],
  };
  const reply = await planReply({
    text: "the thing for chem is kinda soon I think",
    image: null,
    clock,
    vision: async () => true,
    extract: async () => result,
  });
  assert.equal(reply.proposals[0]?.title, "Chem worksheet");
});

test("messy text without a key shows the server message", async () => {
  const reply = await planReply({
    text: "the thing for chem is kinda soon I think",
    image: null,
    clock,
    vision: async () => false,
    extract: async () => ({
      ok: false,
      reason: "no_key",
      message: "Photo reading and messy notes need an OpenAI key named OPENAI_API_KEY.",
    }),
  });
  assert.match(reply.text, /OPENAI_API_KEY/);
  assert.equal(reply.proposals.length, 0);
});
