import { z } from "zod";

export const RawCandidateSchema = z
  .object({
    candidate_id: z.string(),
    candidat: z.string(),
    parti: z.string().default(""),
    intentions: z.number(),
    erreur_sup: z.number().nullable().default(null),
    erreur_inf: z.number().nullable().default(null),
    annonce_candidature: z.string().default(""),
    retrait_candidature: z.string().default(""),
  })
  .passthrough();

export const RawPollSchema = z
  .object({
    poll_id: z.string(),
    institut: z.string(),
    commanditaire: z.string().default(""),
    debut_enquete: z.string(),
    fin_enquete: z.string(),
    echantillon: z.number(),
    population: z.string().default(""),
    tour: z.string(),
    hypothese: z.string().nullable().default(null),
    candidats: z.array(RawCandidateSchema).min(1),
  })
  .passthrough();

export const RawFeedSchema = z.array(RawPollSchema);

export type RawCandidate = z.infer<typeof RawCandidateSchema>;
export type RawPoll = z.infer<typeof RawPollSchema>;

/** Validate the upstream feed and fail before publishing a partial result. */
export function parseFeed(data: unknown): RawPoll[] {
  const result = RawFeedSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Schéma MieuxVoter incompatible (${result.error.issues.length} erreurs) :\n${issues}`,
    );
  }
  return result.data;
}
