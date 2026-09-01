import {
  aggregate,
  collapseHypotheses,
  DEFAULT_AGGREGATE_CONFIG,
  type AggregateConfig,
} from "./aggregate.js";
import type { NormalizedPoll } from "./normalize.js";
import type { AggregateEntry, TrendSeries } from "./types.js";

const DAY_MS = 86_400_000;

export interface TrendConfig {
  bucketDays: number;
  historyDays: number;
  /** Fixed grid anchor. Pouls uses the first round of the 2027 election. */
  anchorDate: string;
  aggregate: AggregateConfig;
}

export const DEFAULT_TREND_CONFIG: Readonly<TrendConfig> = {
  bucketDays: 14,
  historyDays: 365,
  anchorDate: "2027-04-18",
  aggregate: DEFAULT_AGGREGATE_CONFIG,
};

/**
 * Recompute the same rolling aggregate at stable, bi-weekly observation dates.
 * Buckets control display cadence and density only; they are not averaging windows.
 */
export function buildTrend(
  polls: NormalizedPoll[],
  now: Date,
  candidateIds: string[],
  config: TrendConfig = DEFAULT_TREND_CONFIG,
): TrendSeries[] {
  const collapsed = collapseHypotheses(polls);
  const start = now.getTime() - config.historyDays * DAY_MS;
  const bucketMs = config.bucketDays * DAY_MS;
  const anchorMs = Date.parse(config.anchorDate);
  if (Number.isNaN(anchorMs)) throw new Error(`Date d’ancrage invalide : ${config.anchorDate}`);

  const buckets = new Map<number, number>();
  let lastFieldworkEnd = -Infinity;

  for (const poll of collapsed) {
    const date = poll.fieldworkEnd.getTime();
    if (date < start || date > now.getTime()) continue;
    const index = Math.floor((date - anchorMs) / bucketMs);
    if (date > lastFieldworkEnd) lastFieldworkEnd = date;
    buckets.set(index, (buckets.get(index) ?? 0) + 1);
  }

  const sortedIndexes = [...buckets.keys()].sort((a, b) => a - b);
  const snapshots = new Map<number, Map<string, AggregateEntry>>();

  for (const index of sortedIndexes) {
    const bucketEnd = anchorMs + (index + 1) * bucketMs;
    const asOf = index === sortedIndexes.at(-1) ? now : new Date(bucketEnd);
    const entries = aggregate(polls, asOf, config.aggregate).candidates;
    snapshots.set(index, new Map(entries.map((entry) => [entry.candidateId, entry])));
  }

  const series: TrendSeries[] = [];
  for (const candidateId of candidateIds) {
    const points: TrendSeries["points"] = [];
    let candidate = candidateId;

    for (const index of sortedIndexes) {
      const entry = snapshots.get(index)?.get(candidateId);
      if (!entry) continue;
      candidate = entry.candidate;
      const bucketEnd = anchorMs + (index + 1) * bucketMs;
      points.push({
        date: new Date(Math.min(bucketEnd, lastFieldworkEnd)).toISOString().slice(0, 10),
        value: entry.score,
        nPolls: buckets.get(index) ?? 0,
        margin: entry.margin,
      });
    }

    if (points.length > 0) series.push({ candidateId, candidate, points });
  }
  return series;
}
