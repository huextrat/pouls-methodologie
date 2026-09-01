import { readFile, writeFile } from "node:fs/promises";

import {
  aggregate,
  buildDuels,
  buildTrend,
  curateFeed,
  normalizeFirstRound,
  parseFeed,
} from "../src/index.js";

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/MieuxVoter/presidentielle2027/main/presidentielle2027.json";

interface Options {
  source: string;
  now: Date;
  output?: string;
}

function usage(): never {
  console.error(`Usage : yarn reproduce [source.json|URL] [--now AAAA-MM-JJ] [--out fichier.json]

Sans source, la commande télécharge le flux public MieuxVoter.`);
  process.exit(1);
}

function parseOptions(args: string[]): Options {
  let source = DEFAULT_SOURCE;
  let now = new Date();
  let output: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--now") {
      const value = args[++index];
      if (!value) usage();
      now = new Date(value);
    } else if (argument === "--out") {
      output = args[++index];
      if (!output) usage();
    } else if (argument === "--help" || argument === "-h") {
      usage();
    } else if (argument.startsWith("--")) {
      usage();
    } else {
      source = argument;
    }
  }

  if (Number.isNaN(now.getTime())) throw new Error("Date --now invalide");
  return { source, now, output };
}

async function loadJson(source: string): Promise<unknown> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Téléchargement échoué : HTTP ${response.status}`);
    return response.json();
  }
  return JSON.parse(await readFile(source, "utf8"));
}

const options = parseOptions(process.argv.slice(2));
const parsed = parseFeed(await loadJson(options.source));
const curated = curateFeed(parsed);
const firstRound = normalizeFirstRound(curated);
const aggregated = aggregate(firstRound, options.now);
const result = {
  generatedAt: new Date().toISOString(),
  asOf: options.now.toISOString(),
  source: options.source,
  excludedPollIds: parsed
    .filter((poll) => !curated.some((candidate) => candidate.poll_id === poll.poll_id))
    .map((poll) => poll.poll_id),
  firstRound: aggregated,
  trend: buildTrend(
    firstRound,
    options.now,
    aggregated.candidates.map((candidate) => candidate.candidateId),
  ),
  measuredDuels: buildDuels(curated, options.now),
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (options.output) {
  await writeFile(options.output, json);
  console.error(`Résultat écrit dans ${options.output}`);
} else {
  process.stdout.write(json);
}
