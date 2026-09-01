import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregate, buildTrend, type NormalizedPoll } from "../src/index.js";

function poll(key: string, date: string, score: number): NormalizedPoll {
  return {
    pollId: key,
    pollKey: key,
    institute: "Test",
    fieldworkEnd: new Date(`${date}T00:00:00Z`),
    sampleSize: 1000,
    hypothesis: "H1",
    candidates: [
      {
        id: "X",
        name: "X",
        party: "",
        intentions: score,
        sourceMargin: 2,
        withdrawalDate: "",
      },
    ],
  };
}

test("trend bucket dates remain stable when build time advances", () => {
  const polls = [poll("P1", "2026-06-25", 20), poll("P2", "2026-07-05", 22)];
  const [day0] = buildTrend(polls, new Date("2026-07-25T00:00:00Z"), ["X"]);
  const [day1] = buildTrend(polls, new Date("2026-07-26T00:00:00Z"), ["X"]);
  assert.deepEqual(day0.points, day1.points);
});

test("last trend point matches the current aggregate exactly", () => {
  const now = new Date("2026-07-21T00:00:00Z");
  const polls = [
    poll("P1", "2026-06-25", 12),
    poll("P2", "2026-07-05", 22),
    poll("P3", "2026-07-20", 18),
  ];
  const current = aggregate(polls, now).candidates[0];
  const [series] = buildTrend(polls, now, ["X"]);
  const last = series.points.at(-1);
  assert.equal(last?.value, current.score);
  assert.equal(last?.margin, current.margin);
  assert.equal(last?.date, "2026-07-20");
});

test("bucket grid is anchored to the first round date", () => {
  const polls = [poll("P1", "2026-06-20", 20), poll("P2", "2026-07-05", 22)];
  const [series] = buildTrend(polls, new Date("2026-07-26T00:00:00Z"), ["X"]);
  assert.deepEqual(
    series.points.map((point) => point.date),
    ["2026-06-28", "2026-07-05"],
  );
});
