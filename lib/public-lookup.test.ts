import assert from "node:assert/strict";
import test from "node:test";
import { lookupPublicFact, publicSearchQuery } from "./public-lookup";

test("a public question is shortened without sending private notes", () => {
  assert.equal(publicSearchQuery("What is photosynthesis?"), "photosynthesis");
  assert.equal(publicSearchQuery("What does lang3030 refer to?"), "LANG3030 university course");
});

test("wikipedia returns a real fact or a clear failure", async () => {
  const known = await lookupPublicFact("What is photosynthesis?");
  if (known.ok) {
    assert.match(known.fact, /photosynthesis/i);
    assert.match(known.source, /^Wikipedia: /);
  } else {
    assert.match(known.message, /public page/);
  }
  const missing = await lookupPublicFact("What does ZZXQ9090 refer to?");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.message, /public page/);
});
