// Adds a batch of hand-picked photos to the private test set.
//
//   npm run import -- ~/path/to/batch1_2026-11-22     # the original 76 photos (copied from urbanLarger)
//   npm run import -- ~/path/to/batch2_YYYY-MM-DD    # later batches: same layout
//
// A batch folder has sub-folders 0–5 (one per region, see REGIONS), each with images and a
// results.txt answer key ("img55.jpg   Egypt, Cairo Governate, Cairo"). The batch is named
// after its folder: use batchN_YYYY-MM-DD, the date the batch was added. Re-importing a batch replaces it; other batches are kept.
//
// Images are copied into data/ (gitignored). After adding a batch, run each model again with
// the usual bench command: only the new photos are sent to it.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { DATA_DIR, IMAGES_DIR, MANIFEST_PATH, Manifest, Region, TestImage } from "./manifest";
import { resolveAdmin, resolveCity, resolveCountry } from "./score";

// Folder → region, as organised in the original experiment.
const REGIONS: Record<string, Region> = {
  "0": "Africa",
  "1": "Asia & Middle East",
  "2": "Oceania",
  "3": "Europe",
  "4": "North & Central America",
  "5": "South America",
};

// Screening decisions (see the methodology page), keyed by "<batch>/<folder>/<file>".
// Fraction of the image height to cut from the bottom, for screen elements left in the capture.
const CROP_BOTTOM: Record<string, number> = {
  "batch1_2026-11-22/5/img68.jpg": 0.14, // large "Google Maps" logo and navigation arrows
};
const TAGS: Record<string, string[]> = {
  "batch1_2026-11-22/1/img54.jpg": ["landmark"], // Masmak Fort, Riyadh
};

function parseAnswerKey(file: string) {
  return fs.readFileSync(file, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const m = l.match(/^(\S+)\s+(.*)$/);
      if (!m) throw new Error(`Can't read answer line: "${l}"`);
      const [country = "", admin = "", city = ""] = m[2].split(",").map((s) => s.replace(/\s*\(or [^)]+\)/g, "").trim());
      return { file: m[1], country, admin, city };
    });
}

// The test-set version is a fingerprint of every image and answer, so it changes
// automatically whenever photos are added, removed or relabelled.
function fingerprint(images: TestImage[]): string {
  const h = crypto.createHash("sha256");
  for (const i of [...images].sort((a, b) => a.id.localeCompare(b.id))) {
    h.update(`${i.id}|${i.answer.country}|${i.answer.admin}|${i.answer.city}\n`);
  }
  return h.digest("hex").slice(0, 8);
}

async function main() {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) {
    console.error("Usage: npm run import -- <path to a batch folder, e.g. batch1_2026-11-22>");
    process.exit(1);
  }
  const batch = path.basename(path.resolve(src)).replace(/[^a-zA-Z0-9_-]/g, "");
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const existing: Manifest | null = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) : null;
  const kept = (existing?.images ?? []).filter((i) => i.batch !== batch);
  for (const old of (existing?.images ?? []).filter((i) => i.batch === batch)) {
    fs.rmSync(path.join(IMAGES_DIR, old.file), { force: true });
  }

  const added: TestImage[] = [];
  const problems: string[] = [];
  for (const folder of Object.keys(REGIONS)) {
    const dir = path.join(src, folder);
    const key = path.join(dir, "results.txt");
    if (!fs.existsSync(key)) continue;

    for (const row of parseAnswerKey(key)) {
      const ref = `${batch}/${folder}/${row.file}`;
      const imgPath = path.join(dir, row.file);
      if (!fs.existsSync(imgPath)) { problems.push(`missing image ${ref}`); continue; }

      const countryId = resolveCountry(row.country);
      if (!countryId || !resolveAdmin(row.admin, countryId) || !resolveCity(row.city, countryId)) {
        problems.push(`${ref}: "${row.country} / ${row.admin} / ${row.city}" isn't in src/ontology.ts yet. Add the missing name there.`);
      }

      const id = `${batch}_${folder}_${path.parse(row.file).name}`;
      const file = `${id}.jpg`;
      // Re-encode every image: consistent JPEG, metadata stripped, optional crop.
      let img = sharp(imgPath).rotate();
      const crop = CROP_BOTTOM[ref];
      if (crop) {
        const { width, height } = await img.metadata();
        img = img.extract({ left: 0, top: 0, width: width!, height: Math.round(height! * (1 - crop)) });
      }
      await img.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toFile(path.join(IMAGES_DIR, file));

      added.push({
        id, file, batch, region: REGIONS[folder],
        answer: { country: row.country, admin: row.admin, city: row.city },
        tags: TAGS[ref] ?? [],
      });
    }
  }
  if (!added.length) {
    console.error(`No images found in ${src}. Expected sub-folders 0–5, each with a results.txt.`);
    process.exit(1);
  }

  const images = [...kept, ...added];
  const manifest: Manifest = { name: "Whereabouts", version: fingerprint(images), updated_at: new Date().toISOString(), images };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const batches = [...new Set(images.map((i) => i.batch))].map((b) => `${b} (${images.filter((i) => i.batch === b).length})`).join(", ");
  console.log(`Imported batch "${batch}": ${added.length} images. Test set now has ${images.length} images: ${batches}. Version ${manifest.version}.`);
  if (kept.length) console.log(`Next: run each model again with "npm run bench -- --model ...". Only the new photos will be sent.`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ${p}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
