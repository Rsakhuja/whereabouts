# Whereabouts

A geolocation benchmark for vision-language models. Each model sees one street-level photo
and names the country, state/province and city; 1 point per correct level (max 3 per photo).
Models are called through the Vercel AI Gateway. The website in site/ is static and shows
totals only.

## Privacy rules (never break these)
- data/ (photos + answer key) and results/ (per-photo guesses and clue text) are private.
  Never commit, print in full, upload or share them. Both are in .gitignore; keep it that way.
- Only site/data.json (totals) is published. Never add per-photo data to it.
- Never print, log or commit .env, .env.local or the AI_GATEWAY_API_KEY.
- Before any commit, check `git status` shows nothing from data/ or results/.

## Don't change without asking
- The prompt in src/models.ts (changing it invalidates all existing results).
- Scoring in src/score.ts and the screening settings in src/import.ts.
- Never swap, drop or relabel photos because of how models did on them.

## Commands
- npm run import -- <batch folder>   add a batch of photos to data/
- npm run bench -- --model <id>      run a model (only runs photos it hasn't answered)
- npm run bench -- --model <id> --dry-run --limit 3   free test, no API calls
- npm run site                       rebuild site/data.json from results/
- npm run dev                        preview the site locally

## Adding a model
1. Confirm the exact model ID on https://vercel.com/ai-gateway/models and that it accepts
   images. Prefer stable IDs over -latest / -preview / -exp. Don't guess IDs.
2. Ask before running (it costs money). Then: npm run bench -- --model <id>
   If photos end with ERROR, re-run the same command.
3. Add a display name in whereabouts.config.json under "models".
   Older models for the progression chart also go in the "older" list.
4. npm run site, then commit and push (ask first). It appears as a new leaderboard row.

## Adding photos
1. Photos must be screened against the criteria on site/method.html BEFORE any model runs on them.
2. New batch folder named batchN_YYYY-MM-DD, with sub-folders by region
   (0 Africa, 1 Asia & Middle East, 2 Oceania, 3 Europe, 4 North & Central America,
   5 South America), each with images and a results.txt answer key.
3. npm run import -- <folder>. If it reports an unknown place name, add the name to
   src/ontology.ts (genuine alternate names only) and import again.
4. Re-run every model on the leaderboard (only new photos are sent), then npm run site.
   A model only appears on the site once it has answered every photo.

## Working style
- If something fails, show the actual error. Don't make up results, model IDs or numbers.
- Keep changes small; don't refactor working code unprompted.