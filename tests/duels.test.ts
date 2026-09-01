import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDuels, parseFeed } from "../src/index.js";

function duelPoll(id: string, end: string, a: number, b: number, sampleSize = 1000) {
  return {
    poll_id: id,
    institut: "IFOP",
    debut_enquete: end,
    fin_enquete: end,
    echantillon: sampleSize,
    tour: "2nd Tour",
    candidats: [
      { candidate_id: "A", candidat: "A", intentions: a },
      { candidate_id: "B", candidat: "B", intentions: b },
    ],
  };
}

test("measured duels are weighted and remain two-sided", () => {
  const feed = parseFeed([
    duelPoll("D1", "2026-07-10", 55, 45),
    duelPoll("D2", "2026-07-20", 50, 50),
  ]);
  const [duel] = buildDuels(feed, new Date("2026-07-21T00:00:00Z"));
  assert.equal(duel.id, "A__B");
  assert.equal(duel.nPolls, 2);
  assert.ok(duel.a.score >= duel.b.score);
  assert.ok(Math.abs(duel.a.score + duel.b.score - 100) <= 0.1);
});

test("duplicate hypotheses from one fieldwork count once", () => {
  const feed = parseFeed([
    duelPoll("D1_A", "2026-07-20", 54, 46),
    duelPoll("D1_B", "2026-07-20", 56, 44),
  ]);
  const [duel] = buildDuels(feed, new Date("2026-07-21T00:00:00Z"));
  assert.equal(duel.nPolls, 1);
  assert.equal(duel.a.score, 55);
});

test("duels before the fixed relevance floor are ignored", () => {
  const feed = parseFeed([duelPoll("OLD", "2026-06-30", 55, 45)]);
  assert.deepEqual(buildDuels(feed, new Date("2026-07-21T00:00:00Z")), []);
});
