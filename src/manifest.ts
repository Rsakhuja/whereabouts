import * as fs from "fs";
import * as path from "path";

export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data"); // private: gitignored
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
export const RESULTS_DIR = path.join(ROOT, "results"); // private: gitignored (guesses describe the images)

export type Region =
  | "Africa" | "Asia & Middle East" | "Oceania" | "Europe" | "North & Central America" | "South America";

export interface TestImage {
  id: string; // e.g. "urbanLarger_1_img54"
  file: string; // relative to data/images
  batch: string; // the folder it was imported from
  region: Region;
  answer: { country: string; admin: string; city: string };
  tags: string[]; // e.g. ["landmark"]
}

export interface Manifest {
  name: string;
  version: string; // fingerprint of all images and answers; changes when photos are added
  updated_at: string;
  images: TestImage[];
}

export function readManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`No test set at ${path.relative(process.cwd(), MANIFEST_PATH)}. Run "npm run import -- <path to a batch folder>" first.`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
}
