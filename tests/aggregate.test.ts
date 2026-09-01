import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregate,
  collapseHypotheses,
  normalizeFirstRound,
  parseFeed,
  typicalPollMargin,
  type NormalizedCandidate,
  type NormalizedPoll,
} from "../src/index.js";

const NOW = new Date("2026-07-21T00:00:00Z");
const DAY_MS = 86_400_000;

function candidate(id: string, intentions: number, withdrawalDate = ""): NormalizedCandidate {
  return {
    id,
    name: id,
    party: "",
    intentions,
    sourceMargin: 2,
    withdrawalDate,
  };
}

function poll(
  key: string,
  intentions: number,
  ageDays = 0,
  sampleSize = 1000,
  candidateId = "X",
): NormalizedPoll {
  return {
    pollId: key,
    pollKey: key,
    institute: "Test",
    fieldworkEnd: new Date(NOW.getTime() - ageDays * DAY_MS),
    sampleSize,
    hypothesis: "H1",
    candidates: [candidate(candidateId, intentions)],
  };
}

test("schema: validates the upstream shape and rejects missing fields", () => {
  const valid = [
    {
      poll_id: "P1_A",
      institut: "IFOP",
      debut_enquete: "2026-07-19",
      fin_enquete: "2026-07-20",
      echantillon: 1000,
      tour: "1er Tour",
      candidats: [{ candidate_id: "X", candidat: "X", intentions: 20 }],
    },
  ];
  assert.equal(parseFeed(valid).length, 1);
  assert.throws(() => parseFeed([{ poll_id: "broken" }]));
});

test("normalization groups hypotheses by institute and fieldwork dates", () => {
  const feed = parseFeed([
    {
      poll_id: "P1_A",
      institut: "ifop",
      debut_enquete: "2026-07-19",
      fin_enquete: "2026-07-20",
      echantillon: 1000,
      tour: "1er Tour",
      candidats: [{ candidate_id: "X", candidat: "X", intentions: 10 }],
    },
    {
      poll_id: "P1_B",
      institut: "IFOP",
      debut_enquete: "2026-07-19",
      fin_enquete: "2026-07-20",
      echantillon: 1000,
      tour: "1er Tour",
      candidats: [{ candidate_id: "X", candidat: "X", intentions: 20 }],
    },
  ]);
  const collapsed = collapseHypotheses(normalizeFirstRound(feed));
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].candidates.get("X")?.value, 15);
});

test("recency weighting gives more weight to the latest poll", () => {
  const result = aggregate([poll("recent", 10), poll("old", 30, 14)], NOW);
  assert.equal(result.candidates[0].score, 15.4);
});

test("sample weighting grows with the square root of sample size", () => {
  const result = aggregate([poll("n1000", 10), poll("n4000", 30, 0, 4000)], NOW);
  assert.equal(result.candidates[0].score, 23.3);
});

test("minimum coverage and withdrawal filters are applied", () => {
  const polls = Array.from({ length: 5 }, (_, index) => ({
    ...poll(`P${index}`, 20),
    candidates: [
      candidate("COMMON", 20),
      ...(index === 0 ? [candidate("RARE", 8)] : []),
      ...(index === 0 ? [candidate("OUT", 5, "2026-01-01")] : []),
    ],
  }));
  const result = aggregate(polls, NOW);
  assert.deepEqual(
    result.candidates.map((entry) => entry.candidateId),
    ["COMMON"],
  );
});

test("displayed margin uses the mean poll size, not pooled sample size", () => {
  const expected = 1.96 * Math.sqrt(0.25 / 1000) * 100;
  assert.equal(typicalPollMargin(50, 1000), expected);

  const result = aggregate([poll("P1", 50), poll("P2", 50)], NOW);
  assert.equal(result.candidates[0].margin, 3.1);
});

test("adaptive window expands until it contains five distinct polls", () => {
  const polls = [
    poll("P1", 20, 5),
    poll("P2", 20, 10),
    poll("P3", 20, 20),
    poll("P4", 20, 35),
    poll("P5", 20, 40),
  ];
  assert.equal(aggregate(polls, NOW).window.days, 45);
});
