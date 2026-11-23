// Runs one or more models over the private test set and writes results/<model>.json.
//
//   npm run bench -- --model anthropic/claude-opus-5-5
//   npm run bench -- --model openai/gpt-6-astra,google/gemini-3.8-flash --concurrency 6
//   npm run bench -- --model anthropic/claude-opus-5-5 --reasoning high
//   npm run bench -- --model anthropic/claude-opus-5-5 --dry-run --limit 3   # no API calls
//
// Runs resume: re-running the same command only retries images that are missing or errored.

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { categoriesForGuess, CLUE_CATEGORIES, ClueCategory } from "./clues";
import { IMAGES_DIR, RESULTS_DIR, TestImage, readManifest } from "./manifest";
import { askModel, PROMPT_VERSION, ReasoningSetting } from "./models";
import { resolveAdmin, resolveCity, resolveCountry, scoreGuess } from "./score";
import { bootstrapCI } from "./stats";
import { Guess, GroundTruth } from "./types";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export type Outcome = "city" | "state" | "country" | "partial" | "wrong" | "refused" | "error";

export interface Round {
  outcome: Outcome;
  guess?: Guess;
  points?: number;
  breakdown?: { country: boolean; state_province: boolean; city: boolean };
  unresolved_fields?: string[];
  clue_categories?: ClueCategory[];
  raw?: string;
  usage?: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null };
  latencyMs?: number;
  ran_at?: string; // when this photo was run, so batches run at different times stay traceable
  error?: string;
}

export interface Summary {
  n: number;
  answered: number; // got a usable reply (including refusals)
  errors: number;
  refused: number;
  points: number;
  maxPoints: number;
  pct: number; // points / maxPoints; errors and refusals score 0
  ci95: [number, number];
  country: number;
  admin: number;
  city: number;
  outcomes: Record<Outcome, number>;
  byRegion: Record<string, { n: number; pct: number; country: number; city: number }>;
  clues: Record<string, { cited: number; share: number; countryWhenCited: number | null; cityWhenCited: number | null }>;
  avgCluesPerGuess: number;
}

export interface ResultFile {
  model: string;
  reasoning: ReasoningSetting;
  prompt_version: string;
  dataset: { name: string; version: string; images: number };
  evaluated_at: string;
  updated_at: string;
  dry_run: boolean;
  summary: Summary;
  rounds: Record<string, Round>;
}

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const reasoning = (get("--reasoning") ?? "off") as ReasoningSetting;
  if (!["off", "low", "medium", "high", "xhigh", "max"].includes(reasoning)) {
    throw new Error(`--reasoning must be off|low|medium|high|xhigh|max (got "${reasoning}")`);
  }
  return {
    models: (get("--model") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    reasoning,
    concurrency: Number(get("--concurrency") ?? 4),
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    fresh: argv.includes("--fresh"),
    dryRun: argv.includes("--dry-run"),
  };
}

export function resultPath(model: string, reasoning: ReasoningSetting, dryRun = false): string {
  const slug = model.replace(/[^a-zA-Z0-9.-]+/g, "_");
  return path.join(RESULTS_DIR, `${dryRun ? "dryrun__" : ""}${slug}${reasoning === "off" ? "" : `__${reasoning}`}.json`);
}

export function groundTruth(img: TestImage): GroundTruth {
  const country_id = resolveCountry(img.answer.country);
  return {
    filename: img.file,
    country_id,
    admin_id: resolveAdmin(img.answer.admin, country_id),
    city_id: resolveCity(img.answer.city, country_id),
  };
}

export function outcomeOf(b: { country: boolean; state_province: boolean; city: boolean }, points: number): Outcome {
  if (points === 3) return "city";
  if (b.country && b.state_province) return "state";
  if (b.country) return "country";
  if (points > 0) return "partial";
  return "wrong";
}

export function summarize(images: TestImage[], rounds: Record<string, Round>): Summary {
  const n = images.length || 1;
  const rs = images.map((i) => rounds[i.id]);
  const points = (r?: Round) => r?.points ?? 0;
  const hit = (r: Round | undefined, k: "country" | "state_province" | "city") => !!r?.breakdown?.[k];

  const outcomes = { city: 0, state: 0, country: 0, partial: 0, wrong: 0, refused: 0, error: 0 } as Record<Outcome, number>;
  for (const r of rs) if (r) outcomes[r.outcome]++;

  const byRegion: Summary["byRegion"] = {};
  for (const region of [...new Set(images.map((i) => i.region))]) {
    const sub = images.filter((i) => i.region === region).map((i) => rounds[i.id]);
    byRegion[region] = {
      n: sub.length,
      pct: sub.reduce((s, r) => s + points(r), 0) / (sub.length * 3),
      country: sub.filter((r) => hit(r, "country")).length / sub.length,
      city: sub.filter((r) => hit(r, "city")).length / sub.length,
    };
  }

  // Clue categories: how often each is cited, and accuracy on the guesses that cite it.
  const answered = rs.filter((r): r is Round => !!r && r.outcome !== "error" && r.outcome !== "refused");
  const clues: Summary["clues"] = {};
  for (const key of [...CLUE_CATEGORIES.map((c) => c.key), "other"]) {
    const citing = answered.filter((r) => r.clue_categories?.includes(key as ClueCategory));
    clues[key] = {
      cited: citing.length,
      share: answered.length ? citing.length / answered.length : 0,
      countryWhenCited: citing.length ? citing.filter((r) => hit(r, "country")).length / citing.length : null,
      cityWhenCited: citing.length ? citing.filter((r) => hit(r, "city")).length / citing.length : null,
    };
  }

  const maxPoints = images.length * 3;
  const total = rs.reduce((s, r) => s + points(r), 0);
  const ci = bootstrapCI(rs.map((r) => points(r) / 3));
  return {
    n: images.length,
    answered: rs.filter((r) => r && r.outcome !== "error").length,
    errors: outcomes.error,
    refused: outcomes.refused,
    points: total,
    maxPoints,
    pct: maxPoints ? total / maxPoints : 0,
    ci95: ci,
    country: rs.filter((r) => hit(r, "country")).length / n,
    admin: rs.filter((r) => hit(r, "state_province")).length / n,
    city: rs.filter((r) => hit(r, "city")).length / n,
    outcomes,
    byRegion,
    clues,
    avgCluesPerGuess: answered.length ? answered.reduce((s, r) => s + (r.guess?.features.length ?? 0), 0) / answered.length : 0,
  };
}

async function runModel(model: string, images: TestImage[], args: ReturnType<typeof parseArgs>, dataset: { name: string; version: string }) {
  const outFile = resultPath(model, args.reasoning, args.dryRun);
  let prev: ResultFile | null = null;
  if (!args.fresh && fs.existsSync(outFile)) {
    prev = JSON.parse(fs.readFileSync(outFile, "utf-8"));
    // Each photo is scored on its own, so answers stay valid when photos are added.
    // Only a different prompt means starting over.
    if (prev!.prompt_version !== PROMPT_VERSION) {
      console.log(`  ${path.basename(outFile)} used a different prompt, so starting fresh`);
      prev = null;
    }
  }
  const startedAt = new Date().toISOString();
  // Keep answers only for photos still in the test set.
  const ids = new Set(images.map((i) => i.id));
  const rounds: Record<string, Round> = Object.fromEntries(Object.entries(prev?.rounds ?? {}).filter(([id]) => ids.has(id)));
  const todo = images.filter((i) => !rounds[i.id] || rounds[i.id].outcome === "error");
  console.log(`\n${model}  (reasoning ${args.reasoning}${args.dryRun ? ", DRY RUN" : ""}): ${todo.length} to run, ${images.length - todo.length} already done`);
  if (!todo.length) console.log("  nothing new to run");

  const save = () => {
    const out: ResultFile = {
      model,
      reasoning: args.reasoning,
      prompt_version: PROMPT_VERSION,
      dataset: { ...dataset, images: images.length },
      evaluated_at: prev?.evaluated_at ?? startedAt,
      updated_at: new Date().toISOString(),
      dry_run: args.dryRun,
      summary: summarize(images, rounds),
      rounds,
    };
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    return out;
  };

  let next = 0, done = 0, lastSave = Date.now();
  const worker = async () => {
    while (next < todo.length) {
      const img = todo[next++];
      try {
        const res = await askModel(model, fs.readFileSync(path.join(IMAGES_DIR, img.file)), { reasoning: args.reasoning, dryRun: args.dryRun });
        if (res.refused) {
          rounds[img.id] = { outcome: "refused", guess: res.guess, points: 0, raw: res.raw.slice(0, 2000), usage: res.usage, latencyMs: res.latencyMs };
        } else {
          const s = scoreGuess(res.guess, groundTruth(img));
          rounds[img.id] = {
            outcome: outcomeOf(s.breakdown, s.points),
            guess: res.guess,
            points: s.points,
            breakdown: s.breakdown,
            ...(s.unresolved_fields ? { unresolved_fields: s.unresolved_fields } : {}),
            clue_categories: categoriesForGuess(res.guess.features),
            usage: res.usage,
            latencyMs: res.latencyMs,
          };
        }
      } catch (err: any) {
        rounds[img.id] = { outcome: "error", error: String(err?.message ?? err).slice(0, 500) };
      }
      rounds[img.id].ran_at = new Date().toISOString();
      done++;
      const r = rounds[img.id];
      const mark = r.outcome === "error" ? `ERROR ${r.error!.slice(0, 80)}` : r.outcome === "refused" ? "refused" : `${r.points}/3  ${r.guess!.city}, ${r.guess!.country}`;
      console.log(`  [${String(done).padStart(2)}/${todo.length}] ${img.id.padEnd(10)} ${mark}`);
      if (Date.now() - lastSave > 5000) { save(); lastSave = Date.now(); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, worker));

  const s = save().summary;
  const p = (x: number) => `${(x * 100).toFixed(0)}%`;
  console.log(`  → ${(s.pct * 100).toFixed(1)}% (95% range ${p(s.ci95[0])}–${p(s.ci95[1])}); country ${p(s.country)}, state ${p(s.admin)}, city ${p(s.city)}, refused ${s.refused}${s.errors ? `  ⚠ ${s.errors} errors: run the same command again to retry` : ""}`);
  console.log(`  saved ${path.relative(process.cwd(), outFile)}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.models.length) {
    console.error("Usage: npm run bench -- --model <gateway model id>[,<another>] [--reasoning off|low|medium|high|xhigh|max] [--concurrency 4] [--limit N] [--dry-run] [--fresh]");
    process.exit(1);
  }
  if (!args.dryRun && !process.env.AI_GATEWAY_API_KEY) {
    console.error("Missing AI_GATEWAY_API_KEY in .env (or use --dry-run to test without one).");
    process.exit(1);
  }
  const manifest = readManifest();
  const images = manifest.images.slice(0, args.limit ?? manifest.images.length);
  console.log(`${manifest.name}: ${images.length} images (test set ${manifest.version}), prompt ${PROMPT_VERSION}`);
  for (const model of args.models) await runModel(model, images, args, { name: manifest.name, version: manifest.version });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
