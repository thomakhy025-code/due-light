import assert from "node:assert/strict";
import test from "node:test";
import { groundedInSource } from "./material-questions";
import { composeDeskReply } from "./study-agent";
import { SAMPLE_NOTES } from "./study-notes";
import type { WallClock } from "./shanghai";

const clock: WallClock = {
  year: 2026,
  month: 11,
  day: 5,
  hour: 15,
  minute: 0,
  weekday: "Thu",
  iso: "2026-11-05",
};

test("a text deadline is classified and not turned into a study card", () => {
  const reply = composeDeskReply({ text: "Essay due November 14", clock, prior: null });
  assert.equal(reply.kind, "deadline");
  assert.equal(reply.study, null);
  assert.equal(reply.proposals[0]?.title, "Essay");
  assert.equal(reply.proposals[0]?.date, "2026-11-14");
  assert.match(reply.text, /Deadline/);
  assert.doesNotMatch(reply.text, /Highlighted points/);
});

test("course notes get a summary and questions that name the material", () => {
  const reply = composeDeskReply({ text: SAMPLE_NOTES, clock, prior: null });
  assert.equal(reply.kind, "notes");
  assert.equal(reply.study?.title, "Cell respiration");
  assert.match(reply.text, /Glycolysis does not need oxygen/);
  assert.match(reply.text, /electron transport chain/);
  const prompts = reply.study?.questions.map((question) => question.prompt).join("\n") ?? "";
  assert.match(prompts, /oxygen/);
  assert.match(prompts, /glycolysis/i);
  assert.doesNotMatch(prompts, /an exam describes a new situation|fresh example|you have not revised/i);
});

test("a follow-up answers from the earlier notes instead of repeating the card", () => {
  const first = composeDeskReply({ text: SAMPLE_NOTES, clock, prior: null });
  assert.ok(first.study);
  const prior = {
    title: first.study.title,
    points: first.study.points,
    prompts: first.study.questions.map((question) => question.prompt),
  };
  const second = composeDeskReply({ text: "Why doesn't glycolysis need oxygen?", clock, prior });
  assert.equal(second.kind, "followup");
  assert.equal(second.study, null);
  assert.match(second.text, /Follow-up, still on Cell respiration/);
  assert.match(second.text, /does not need oxygen/);
  assert.match(second.text, /cytoplasm/);
  assert.doesNotMatch(second.text, /Highlighted points/);
  assert.notEqual(second.text, first.text);
});

test("the study model is kept only when it stays inside the notes", () => {
  const notes = "Glycolysis splits glucose into pyruvate in the cytoplasm and does not need oxygen.";
  assert.equal(groundedInSource("glycolysis is a chemical that is used to make glucose.", notes), false);
  assert.equal(groundedInSource("pyruvate in the cytoplasm and does not need oxygen", notes), true);
});

test("a question with no notes does not invent an answer", () => {
  const reply = composeDeskReply({ text: "What is osmosis?", clock, prior: null });
  assert.equal(reply.kind, "question");
  assert.match(reply.text, /don’t have your notes/);
  assert.equal(reply.study, null);
});
