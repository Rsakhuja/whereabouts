// Writes site/data.json from results/*.json: totals only, nothing per image.
// The site/ folder is what Vercel serves; commit it after running this.
//
//   npm run site              # complete runs only (what gets published)
//   npm run site -- --preview # also include partial runs, for checking locally (don't commit)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preview = process.argv.includes("--preview");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf-8"));
const config = fs.existsSync(path.join(ROOT, "whereabouts.config.json")) ? readJson(path.join(ROOT, "whereabouts.config.json")) : {};

const manifestPath = path.join(ROOT, "data", "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error('data/manifest.json not found. Run "npm run import -- <path to urbanLarger>" first.');
  process.exit(1);
}
const manifest = readJson(manifestPath);

// Clue category labels, kept in step with src/clues.ts.
const CATEGORIES = [
  ["script", "Script & language"], ["signs", "Signs & shop names"], ["roads", "Road markings & driving side"],
  ["vehicles", "Vehicles & plates"], ["architecture", "Architecture & buildings"], ["nature", "Vegetation, terrain & climate"],
  ["infrastructure", "Poles, wires & street furniture"], ["landmarks", "Landmarks"], ["interface", "Map interface & watermarks"], ["other", "Other"],
].map(([key, label]) => ({ key, label }));

const resultsDir = path.join(ROOT, "results");
const files = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir).filter((f) => f.endsWith(".json") && !f.startsWith("dryrun__")) : [];
const newMs = (config.new_days ?? 30) * 86400e3;
const models = [];
for (const f of files) {
  const r = readJson(path.join(resultsDir, f));
  const s = r.summary;
  const complete = r.dataset?.version === manifest.version && s?.n === manifest.images.length && s?.errors === 0;
  if (!complete && !preview) {
    console.warn(`  ${f}: not complete (${s?.answered ?? 0}/${manifest.images.length} answered, ${s?.errors ?? 0} errors), so not published. Re-run its bench command to finish it.`);
    continue;
  }
  const [provider, ...rest] = r.model.split("/");
  models.push({
    key: f.replace(/\.json$/, ""),
    model: r.model,
    name: config.models?.[r.model]?.name ?? (rest.join("/") || r.model),
    provider: config.providers?.[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1),
    reasoning: r.reasoning,
    prompt_version: r.prompt_version,
    evaluated_at: r.evaluated_at,
    is_new: Date.now() - Date.parse(r.evaluated_at) < newMs,
    older: (config.older ?? []).includes(r.model),
    complete,
    // Totals only. r.rounds (per-image guesses and clue text) is deliberately left out.
    summary: {
      n: s.n, refused: s.refused, errors: s.errors, points: s.points, maxPoints: s.maxPoints,
      pct: s.pct, ci95: s.ci95, country: s.country, admin: s.admin, city: s.city,
      outcomes: s.outcomes, byRegion: s.byRegion, clues: s.clues, avgCluesPerGuess: s.avgCluesPerGuess,
    },
  });
}
models.sort((a, b) => b.summary.pct - a.summary.pct);

const regions = {};
for (const img of manifest.images) regions[img.region] = (regions[img.region] ?? 0) + 1;

const data = {
  generated_at: new Date().toISOString(),
  repo_url: config.repo_url || null,
  dataset: {
    name: manifest.name,
    version: manifest.version,
    images: manifest.images.length,
    countries: new Set(manifest.images.map((i) => i.answer.country)).size,
    regions,
    landmark_images: manifest.images.filter((i) => i.tags.includes("landmark")).length,
  },
  categories: CATEGORIES,
  models,
};
fs.writeFileSync(path.join(ROOT, "site", "data.json"), JSON.stringify(data, null, 2));
console.log(`site/data.json written: ${models.length} model run(s)${preview ? " (PREVIEW: includes partial runs, don't commit this)" : ""}.`);
