import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregate, normalizeFirstRound, parseFeed, RawFeedSchema } from "../src/index.js";

const polls = [
  {
    poll_id: "P1_A",
    institut: "IFOP",
    debut_enquete: "2026-09-15",
    fin_enquete: "2026-09-16",
    echantillon: 1000,
    tour: "1er Tour",
    candidats: [{ candidate_id: "X", candidat: "X", intentions: 20 }],
  },
];
const envelope = {
  source: { name: "Mieux Voter" },
  usage_guidelines: [],
  hypotheses: [],
  polls,
  contribution: { welcome: true },
};

test("schema: both public entry points accept the envelope and historical arrays", () => {
  const historical = parseFeed(polls);
  assert.equal(historical.length, 1);
  assert.equal(historical[0].candidats[0].erreur_sup, null);
  assert.deepEqual(parseFeed(envelope), historical);
  assert.deepEqual(RawFeedSchema.parse(envelope), historical);
  assert.deepEqual(RawFeedSchema.parse(polls), historical);
});

test("schema: the envelope preserves historical calculation results and input", () => {
  const before = structuredClone(envelope);
  const now = new Date("2026-09-25T00:00:00Z");
  assert.deepEqual(
    aggregate(normalizeFirstRound(parseFeed(envelope)), now),
    aggregate(normalizeFirstRound(parseFeed(polls)), now),
  );
  assert.deepEqual(envelope, before);
});

test("schema: one invalid poll or candidate rejects the entire feed in either format", () => {
  for (const invalid of [
    { ...polls[0], echantillon: "invalid" },
    { ...polls[0], candidats: [{ candidate_id: "X", candidat: "X", intentions: "invalid" }] },
  ]) {
    for (const input of [[...polls, invalid], { polls: [...polls, invalid] }]) {
      assert.throws(() => parseFeed(input), /Schéma MieuxVoter incompatible/);
      assert.equal(RawFeedSchema.safeParse(input).success, false);
    }
  }
});

test("schema: malformed envelopes are rejected rather than replaced by an empty feed", () => {
  for (const input of [null, {}, { polls: null }, { polls: {} }, { polls: "invalid" }]) {
    assert.throws(() => parseFeed(input), /Schéma MieuxVoter incompatible/);
    assert.equal(RawFeedSchema.safeParse(input).success, false);
  }
});
