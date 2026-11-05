import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_NOTES, asksToStudy, studyFromModelContent, studyFromNotes, stripStudyLead } from "./study-notes";

test("clear bullet notes become points, cards, and application questions", () => {
  const study = studyFromNotes(SAMPLE_NOTES);
  assert.ok(study);
  assert.equal(study?.title, "Cell respiration");
  assert.ok(study && study.points.length >= 3);
  assert.ok(study?.points.some((point) => /glycolysis/i.test(point)));
  assert.ok(study?.flashcards.some((card) => card.front === "Osmosis"));
  assert.ok(study && study.questions.length >= 2);
  for (const question of study?.questions ?? []) {
    assert.match(question.prompt, /glycolysis|krebs|electron|osmosis|oxygen|pyruvate|mitochondria/i);
    assert.doesNotMatch(question.prompt, /an exam describes a new situation|fresh example|you have not revised/i);
    assert.doesNotMatch(question.prompt, /^\s*(what is|define)\b/i);
    assert.ok(question.approach.length > 40);
  }
});

test("a summarise instruction still uses the notes underneath", () => {
  const wrapped = `Please summarise these notes:\n${SAMPLE_NOTES}`;
  assert.equal(asksToStudy(wrapped), true);
  assert.match(stripStudyLead(wrapped), /Glycolysis/);
  assert.equal(studyFromNotes(wrapped)?.title, "Cell respiration");
});

test("two clear sentences work without a model", () => {
  const study = studyFromNotes(
    "Photosynthesis happens in the chloroplast when plants capture light to make sugar. Respiration releases the energy from that sugar inside the mitochondria.",
  );
  assert.ok(study);
  assert.equal(study?.points.length, 2);
  assert.ok(study && study.questions.length >= 2);
  assert.match(study?.questions.map((question) => question.prompt).join(" ") ?? "", /photosynthesis|chloroplast|respiration|mitochondria|sugar/i);
});

test("messy notes are left for the model", () => {
  assert.equal(asksToStudy("hello there"), false);
  assert.equal(asksToStudy("Chapter summary due Nov 14"), false);
  assert.equal(studyFromNotes("so like cells do this energy thing and water moves around idk it's kinda important"), null);
  assert.equal(studyFromNotes("Essay due tomorrow"), null);
});

test("model study JSON is cleaned and recall-only questions are replaced", () => {
  const study = studyFromModelContent(
    JSON.stringify({
      title: "Acids",
      points: ["An acid donates a proton.", "A base accepts a proton."],
      flashcards: [{ front: "Acid", back: "Donates a proton." }],
      questions: [{ prompt: "What is an acid?", approach: "Say the definition." }],
    }),
  );
  assert.equal(study?.title, "Acids");
  assert.ok(study?.questions.every((question) => !/^\s*what is\b/i.test(question.prompt)));
  assert.ok(study && study.questions.length >= 2);
});
