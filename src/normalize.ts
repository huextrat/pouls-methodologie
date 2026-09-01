import type { RawPoll } from "./schema.js";

const INSTITUTE_LABELS: Record<string, string> = {
  cluster17: "Cluster17",
  elabe: "ELABE",
  "harris interactive": "Harris Interactive",
  ifop: "IFOP",
  "ipsos bva": "Ipsos BVA",
  odoxa: "Odoxa",
  opinionway: "OpinionWay",
  verian: "Verian",
};

export function normalizeInstitute(raw: string): string {
  const key = raw.trim().toLowerCase();
  return INSTITUTE_LABELS[key] ?? raw.trim();
}

/**
 * Last-resort exclusions for upstream records that cannot be rejected by a
 * general rule. Every entry is public and carries its justification.
 */
export const EXCLUDED_POLL_IDS: Readonly<Record<string, string>> = {
  "20260201_0206_if_A": "sous-population (électeurs LGBT+), population mal étiquetée en amont",
};

export function curateFeed(feed: RawPoll[]): RawPoll[] {
  return feed.filter((poll) => !EXCLUDED_POLL_IDS[poll.poll_id]);
}

export interface NormalizedCandidate {
  id: string;
  name: string;
  party: string;
  intentions: number;
  sourceMargin: number;
  withdrawalDate: string;
}

export interface NormalizedPoll {
  pollId: string;
  /** Shared by all hypotheses from the same institute and fieldwork dates. */
  pollKey: string;
  institute: string;
  fieldworkEnd: Date;
  sampleSize: number;
  hypothesis: string;
  candidates: NormalizedCandidate[];
}

function sourceMargin(upper: number | null, lower: number | null): number {
  if (upper != null) return Math.abs(upper);
  if (lower != null) return Math.abs(lower);
  return 0;
}

/** Keep first-round records and convert them to the engine's internal shape. */
export function normalizeFirstRound(feed: RawPoll[]): NormalizedPoll[] {
  const normalized: NormalizedPoll[] = [];

  for (const poll of feed) {
    if (poll.tour !== "1er Tour") continue;
    const institute = normalizeInstitute(poll.institut);
    const fieldworkEnd = new Date(poll.fin_enquete);
    if (Number.isNaN(fieldworkEnd.getTime())) continue;

    normalized.push({
      pollId: poll.poll_id,
      pollKey: `${institute}|${poll.debut_enquete}|${poll.fin_enquete}`,
      institute,
      fieldworkEnd,
      sampleSize: poll.echantillon,
      hypothesis: poll.hypothese ?? "",
      candidates: poll.candidats.map((candidate) => ({
        id: candidate.candidate_id,
        name: candidate.candidat,
        party: candidate.parti,
        intentions: candidate.intentions,
        sourceMargin: sourceMargin(candidate.erreur_sup, candidate.erreur_inf),
        withdrawalDate: candidate.retrait_candidature,
      })),
    });
  }

  return normalized;
}
