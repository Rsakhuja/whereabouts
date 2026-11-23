// Re-scores the saved guesses in results/ with the current scorer and ontology. No API calls.
// Use after adding aliases to src/ontology.ts.
//
//   npm run rescore
//
// Refusals and errors are left as they are (errors get retried by npm run bench).
// A copy of each file is kept in results/backup-<timestamp>/ before it is rewritten.

import * as fs from "fs";
import * as path from "path";
import { RESULTS_DIR, readManifest } from "./manifest";
import { groundTruth, outcomeOf, ResultFile, Round, summarize } from "./run";
import { scoreGuess } from "./score";

function main() {
  const files = fs.existsSync(RESULTS_DIR)
    ? fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("dryrun__"))
    : [];
  if (!files.length) {
    console.log("No results to rescore.");
    return;
  }

  const manifest = readManifest();
  const byId = new Map(manifest.images.map((i) => [i.id, i]));
  const backupDir = path.join(RESULTS_DIR, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  let totalChanged = 0;
  for (const f of files) {
    const file = path.join(RESULTS_DIR, f);
    const result: ResultFile = JSON.parse(fs.readFileSync(file, "utf-8"));
    fs.copyFileSync(file, path.join(backupDir, f));

    let changed = 0;
    let unresolvedBefore = 0;
    let unresolvedAfter = 0;
    for (const [id, round] of Object.entries(result.rounds)) {
      const img = byId.get(id);
      if (round.unresolved_fields?.length) unresolvedBefore++;
      if (!img || !round.guess || round.outcome === "refused" || round.outcome === "error") {
        if (round.unresolved_fields?.length) unresolvedAfter++;
        continue;
      }
      const s = scoreGuess(round.guess, groundTruth(img));
      const updated: Round = {
        ...round,
        outcome: outcomeOf(s.breakdown, s.points),
        points: s.points,
        breakdown: s.breakdown,
      };
      if (s.unresolved_fields) updated.unresolved_fields = s.unresolved_fields;
      else delete updated.unresolved_fields;
      if (updated.unresolved_fields?.length) unresolvedAfter++;
      if (updated.points !== round.points || JSON.stringify(updated.breakdown) !== JSON.stringify(round.breakdown)) {
        changed++;
        console.log(`  ${result.model}  ${id}: ${round.points}/3 → ${updated.points}/3`);
      }
      result.rounds[id] = updated;
    }

    const images = manifest.images.filter((i) => i.id in result.rounds);
    const before = result.summary.pct;
    result.summary = summarize(images, result.rounds);
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    totalChanged += changed;
    console.log(
      `${result.model}: ${changed} answer(s) changed, score ${pct(before)} → ${pct(result.summary.pct)}, ` +
        `unresolved rounds ${unresolvedBefore} → ${unresolvedAfter}`,
    );
  }
  console.log(`\nDone: ${totalChanged} answer(s) changed across ${files.length} file(s). Backup: ${path.relative(process.cwd(), backupDir)}`);
}

main();
