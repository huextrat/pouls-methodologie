import type { NormalizedPoll } from "./normalize.js";
import type { AggregateResult, TrendDirection } from "./types.js";

export interface AggregateConfig {
  windows: number[];
  minPolls: number;
  tau: number;
  sampleReference: number;
  minimumCoverage: number;
}

export const DEFAULT_AGGREGATE_CONFIG: Readonly<AggregateConfig> = {
  windows: [30, 45, 60],
  minPolls: 5,
  tau: 14,
  sampleReference: 1000,
  minimumCoverage: 0.4,
};

const DAY_MS = 86_400_000;

export interface CollapsedPoll {
  pollKey: string;
  institute: string;
  fieldworkEnd: Date;
  sampleSize: number;
  candidates: Map<string, { value: number; name: string; party: string; withdrawalDate: string }>;
}

/** Collapse hypotheses so one fieldwork contributes one value per candidate. */
export function collapseHypotheses(polls: NormalizedPoll[]): CollapsedPoll[] {
  const groups = new Map<string, NormalizedPoll[]>();
  for (const poll of polls) {
    const group = groups.get(poll.pollKey);
    if (group) group.push(poll);
    else groups.set(poll.pollKey, [poll]);
  }

  const result: CollapsedPoll[] = [];
  for (const [pollKey, group] of groups) {
    const accumulator = new Map<
      string,
      { sum: number; n: number; name: string; party: string; withdrawalDate: string }
    >();

    for (const poll of group) {
      for (const candidate of poll.candidates) {
        const current = accumulator.get(candidate.id);
        if (current) {
          current.sum += candidate.intentions;
          current.n += 1;
          if (candidate.withdrawalDate) current.withdrawalDate = candidate.withdrawalDate;
        } else {
          accumulator.set(candidate.id, {
            sum: candidate.intentions,
            n: 1,
            name: candidate.name,
            party: candidate.party,
            withdrawalDate: candidate.withdrawalDate,
          });
        }
      }
    }

    const candidates: CollapsedPoll["candidates"] = new Map();
    for (const [id, item] of accumulator) {
      candidates.set(id, {
        value: item.sum / item.n,
        name: item.name,
        party: item.party,
        withdrawalDate: item.withdrawalDate,
      });
    }

    const reference = group[0];
    result.push({
      pollKey,
      institute: reference.institute,
      fieldworkEnd: reference.fieldworkEnd,
      sampleSize: Math.max(...group.map((poll) => poll.sampleSize)),
      candidates,
    });
  }
  return result;
}

interface Score {
  score: number;
  nPolls: number;
  pooledSampleSize: number;
  name: string;
  party: string;
  withdrawalDate: string;
}

function weightedScores(
  polls: CollapsedPoll[],
  now: Date,
  config: AggregateConfig,
): Map<string, Score> {
  const accumulator = new Map<
    string,
    {
      numerator: number;
      denominator: number;
      nPolls: number;
      pooledSampleSize: number;
      name: string;
      party: string;
      withdrawalDate: string;
    }
  >();

  for (const poll of polls) {
    const ageDays = (now.getTime() - poll.fieldworkEnd.getTime()) / DAY_MS;
    const recencyWeight = Math.exp(-ageDays / config.tau);
    const sampleWeight = Math.sqrt(poll.sampleSize / config.sampleReference);
    const weight = recencyWeight * sampleWeight;

    for (const [id, candidate] of poll.candidates) {
      const current = accumulator.get(id);
      if (current) {
        current.numerator += weight * candidate.value;
        current.denominator += weight;
        current.nPolls += 1;
        current.pooledSampleSize += poll.sampleSize;
        if (candidate.withdrawalDate) current.withdrawalDate = candidate.withdrawalDate;
      } else {
        accumulator.set(id, {
          numerator: weight * candidate.value,
          denominator: weight,
          nPolls: 1,
          pooledSampleSize: poll.sampleSize,
          name: candidate.name,
          party: candidate.party,
          withdrawalDate: candidate.withdrawalDate,
        });
      }
    }
  }

  const scores = new Map<string, Score>();
  for (const [id, item] of accumulator) {
    scores.set(id, {
      score: item.denominator > 0 ? item.numerator / item.denominator : 0,
      nPolls: item.nPolls,
      pooledSampleSize: item.pooledSampleSize,
      name: item.name,
      party: item.party,
      withdrawalDate: item.withdrawalDate,
    });
  }
  return scores;
}

/** Margin of a typical poll, using the mean sample size rather than pooled N. */
export function typicalPollMargin(score: number, effectiveSampleSize: number): number {
  if (effectiveSampleSize <= 0) return 0;
  const proportion = score / 100;
  return 1.96 * Math.sqrt((proportion * (1 - proportion)) / effectiveSampleSize) * 100;
}

function isWithdrawn(withdrawalDate: string, now: Date): boolean {
  if (!withdrawalDate) return false;
  const date = new Date(withdrawalDate);
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime();
}

function inWindow(
  polls: CollapsedPoll[],
  now: Date,
  fromDays: number,
  toDays: number,
): CollapsedPoll[] {
  const high = now.getTime() - fromDays * DAY_MS;
  const low = now.getTime() - toDays * DAY_MS;
  return polls.filter((poll) => {
    const date = poll.fieldworkEnd.getTime();
    return date > low && date <= high;
  });
}

function distinctPolls(polls: CollapsedPoll[]): number {
  return new Set(polls.map((poll) => poll.pollKey)).size;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Run the seven aggregation steps documented in METHODOLOGIE.md. */
export function aggregate(
  polls: NormalizedPoll[],
  now: Date,
  config: AggregateConfig = DEFAULT_AGGREGATE_CONFIG,
): AggregateResult {
  const collapsed = collapseHypotheses(polls);
  let windowDays = config.windows[config.windows.length - 1];

  for (const days of config.windows) {
    if (distinctPolls(inWindow(collapsed, now, 0, days)) >= config.minPolls) {
      windowDays = days;
      break;
    }
  }

  const current = inWindow(collapsed, now, 0, windowDays);
  const previous = inWindow(collapsed, now, windowDays, windowDays * 2);
  const nWindowPolls = distinctPolls(current);
  const currentScores = weightedScores(current, now, config);
  const previousScores = weightedScores(previous, now, config);

  const candidates: AggregateResult["candidates"] = [];
  for (const [id, score] of currentScores) {
    if (isWithdrawn(score.withdrawalDate, now)) continue;
    if (nWindowPolls > 0 && score.nPolls / nWindowPolls < config.minimumCoverage) continue;

    const meanSampleSize = score.nPolls > 0 ? score.pooledSampleSize / score.nPolls : 0;
    const margin = typicalPollMargin(score.score, meanSampleSize);
    const previousScore = previousScores.get(id);
    const delta = previousScore ? score.score - previousScore.score : 0;
    let trend: TrendDirection = "stable";
    if (previousScore) {
      if (delta > margin) trend = "up";
      else if (delta < -margin) trend = "down";
    }

    candidates.push({
      candidateId: id,
      candidate: score.name,
      party: score.party,
      score: round1(score.score),
      margin: round1(margin),
      trend,
      delta: round1(delta),
      nPolls: score.nPolls,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const dates = current.map((poll) => poll.fieldworkEnd.getTime());

  return {
    window: {
      days: windowDays,
      nPolls: nWindowPolls,
      institutes: [...new Set(current.map((poll) => poll.institute))].sort(),
      from: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : "",
      to: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : "",
    },
    candidates,
  };
}
