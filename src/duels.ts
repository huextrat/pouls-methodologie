import { normalizeInstitute } from "./normalize.js";
import type { RawPoll } from "./schema.js";
import type { DuelEntry, DuelSide } from "./types.js";

const DAY_MS = 86_400_000;

export interface DuelConfig {
  tau: number;
  sampleReference: number;
  windows: number[];
  minimumDate: string;
}

export const DEFAULT_DUEL_CONFIG: Readonly<DuelConfig> = {
  tau: 14,
  sampleReference: 1000,
  windows: [120, 240, 540],
  minimumDate: "2026-07-01",
};

interface Fieldwork {
  ids: [string, string];
  institute: string;
  end: Date;
  endIso: string;
  sampleSize: number;
  scores: Map<string, { sum: number; n: number; name: string }>;
}

interface SideAccumulator {
  name: string;
  numerator: number;
  denominator: number;
  pooledSampleSize: number;
}

interface PairAccumulator {
  sides: Map<string, SideAccumulator>;
  nPolls: number;
  lastFieldworkEnd: string;
  institutes: Set<string>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function margin(score: number, sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  const proportion = score / 100;
  return 1.96 * Math.sqrt((proportion * (1 - proportion)) / sampleSize) * 100;
}

function collectFieldworks(feed: RawPoll[], minimumDate: string): Fieldwork[] {
  const fieldworks = new Map<string, Fieldwork>();

  for (const poll of feed) {
    if (poll.tour !== "2nd Tour" || poll.candidats.length !== 2) continue;
    if (poll.fin_enquete < minimumDate) continue;
    const end = new Date(poll.fin_enquete);
    if (Number.isNaN(end.getTime())) continue;

    const ids = poll.candidats.map((candidate) => candidate.candidate_id).sort() as [
      string,
      string,
    ];
    const institute = normalizeInstitute(poll.institut);
    const key = `${ids[0]}__${ids[1]}|${institute}|${poll.debut_enquete}|${poll.fin_enquete}`;
    let fieldwork = fieldworks.get(key);

    if (!fieldwork) {
      fieldwork = {
        ids,
        institute,
        end,
        endIso: poll.fin_enquete,
        sampleSize: poll.echantillon,
        scores: new Map(),
      };
      fieldworks.set(key, fieldwork);
    }

    fieldwork.sampleSize = Math.max(fieldwork.sampleSize, poll.echantillon);
    for (const candidate of poll.candidats) {
      const current = fieldwork.scores.get(candidate.candidate_id);
      if (current) {
        current.sum += candidate.intentions;
        current.n += 1;
      } else {
        fieldwork.scores.set(candidate.candidate_id, {
          sum: candidate.intentions,
          n: 1,
          name: candidate.candidat,
        });
      }
    }
  }
  return [...fieldworks.values()];
}

function aggregateWindow(
  fieldworks: Fieldwork[],
  now: Date,
  windowDays: number,
  config: DuelConfig,
): DuelEntry[] {
  const lowerBound = now.getTime() - windowDays * DAY_MS;
  const pairs = new Map<string, PairAccumulator>();

  for (const fieldwork of fieldworks) {
    const date = fieldwork.end.getTime();
    if (date < lowerBound || date > now.getTime()) continue;
    const pairId = `${fieldwork.ids[0]}__${fieldwork.ids[1]}`;
    const ageDays = (now.getTime() - date) / DAY_MS;
    const weight =
      Math.exp(-ageDays / config.tau) * Math.sqrt(fieldwork.sampleSize / config.sampleReference);

    let pair = pairs.get(pairId);
    if (!pair) {
      pair = {
        sides: new Map(),
        nPolls: 0,
        lastFieldworkEnd: fieldwork.endIso,
        institutes: new Set(),
      };
      pairs.set(pairId, pair);
    }

    pair.nPolls += 1;
    pair.institutes.add(fieldwork.institute);
    if (fieldwork.endIso > pair.lastFieldworkEnd) {
      pair.lastFieldworkEnd = fieldwork.endIso;
    }

    for (const [id, score] of fieldwork.scores) {
      const value = score.sum / score.n;
      const current = pair.sides.get(id);
      if (current) {
        current.numerator += weight * value;
        current.denominator += weight;
        current.pooledSampleSize += fieldwork.sampleSize;
      } else {
        pair.sides.set(id, {
          name: score.name,
          numerator: weight * value,
          denominator: weight,
          pooledSampleSize: fieldwork.sampleSize,
        });
      }
    }
  }

  const duels: DuelEntry[] = [];
  for (const [id, pair] of pairs) {
    const sides: DuelSide[] = [];
    for (const [candidateId, side] of pair.sides) {
      const score = side.denominator > 0 ? side.numerator / side.denominator : 0;
      const meanSampleSize = pair.nPolls > 0 ? side.pooledSampleSize / pair.nPolls : 0;
      sides.push({
        candidateId,
        candidate: side.name,
        score: round1(score),
        margin: round1(margin(score, meanSampleSize)),
      });
    }
    if (sides.length !== 2) continue;
    sides.sort((a, b) => b.score - a.score);
    duels.push({
      id,
      a: sides[0],
      b: sides[1],
      nPolls: pair.nPolls,
      lastFieldworkEnd: pair.lastFieldworkEnd,
      institutes: [...pair.institutes].sort(),
    });
  }

  duels.sort((a, b) =>
    a.lastFieldworkEnd < b.lastFieldworkEnd
      ? 1
      : a.lastFieldworkEnd > b.lastFieldworkEnd
        ? -1
        : b.nPolls - a.nPolls,
  );
  return duels;
}

/** Aggregate measured second-round head-to-head polls. This is not a projection. */
export function buildDuels(
  feed: RawPoll[],
  now: Date,
  config: DuelConfig = DEFAULT_DUEL_CONFIG,
): DuelEntry[] {
  const fieldworks = collectFieldworks(feed, config.minimumDate);
  for (const window of config.windows) {
    const duels = aggregateWindow(fieldworks, now, window, config);
    if (duels.length > 0) return duels;
  }
  return [];
}
