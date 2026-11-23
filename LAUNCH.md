# Launch checklist (about 1.5 hours)

## 1. Set up (10 min)
1. Unzip, then in Cursor: File → Open Folder → `whereabouts`.
2. In Cursor's terminal: `npm install`
3. `cp .env.example .env`, then paste in your `AI_GATEWAY_API_KEY`.

## 2. Import the first batch (5 min)
4. Make a copy of `geoguessr-experiement/imageData/urbanLarger` and name the copy
   `batch1_2026-11-22` (exactly that: the screening fixes are keyed to this name).
   Copy rather than rename, so your old experiment code keeps working.
5. Run `npm run import -- "/path/to/batch1_2026-11-22"`
   (drag the folder into the terminal to paste its path).
   It should say **Imported batch "batch1_2026-11-22": 76 images** with no problems listed.

## 3. Pick the four models (10 min)
6. On https://vercel.com/ai-gateway/models, find the exact IDs for the latest flagship from
   Anthropic, OpenAI, Google and xAI (they look like `anthropic/claude-opus-5-5`).
   Prefer stable IDs over ones ending in `-latest`, `-preview` or `-exp`.
7. Put their display names in `whereabouts.config.json` under `"models"`.

## 4. Run (20 min)
8. Free check: `npm run bench -- --model <one id> --dry-run --limit 3`
9. Real run: `npm run bench -- --model <id1>,<id2>,<id3>,<id4> --concurrency 6`
   If any photos show ERROR at the end, run the same command again.

## 5. Check the site (10 min)
10. `npm run site`, then `npm run dev` and open the address it prints.
    Check the Leaderboard, Features and Methodology pages.

## 6. Publish (20 min)
11. Create a GitHub repo, put its URL in `whereabouts.config.json` → `repo_url`, and run `npm run site` again.
12. Fill in the README results table, and the Vercel URL once you have it.
13. Commit and push. `data/` and `results/` are gitignored, so they stay on your machine.
    Before pushing, check that `git status` shows no `data/` or `results/` files.
14. vercel.com → Add New → Project → import the repo → Deploy. No settings to change.

## Adding a model later
`npm run bench -- --model <new id>`, then `npm run site`, commit and push. Vercel redeploys on its own.

## Adding photos later
1. Screen the new photos against the criteria on the Methodology page, before running any model on them.
2. Put them in a new folder named `batchN_YYYY-MM-DD` with the date you add it
   (e.g. `batch2_2026-12-15`), laid out like batch 1: sub-folders 0–5 by region
   (0 Africa, 1 Asia & Middle East, 2 Oceania, 3 Europe, 4 North & Central America,
   5 South America), each with the images and a `results.txt` answer key.
3. `npm run import -- /path/to/batch2_2026-12-15`. If it lists a place name the ontology
   doesn't know, add it to `src/ontology.ts` and import again.
4. Re-run the same bench command for every model on the leaderboard. Only the new photos are sent.
5. `npm run site`, commit, push. A model only shows on the site once it has answered every
   photo, so do step 4 for all models before step 5.
