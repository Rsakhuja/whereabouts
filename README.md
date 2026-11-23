# Whereabouts

A geolocation benchmark for vision-language models. Each model sees one street-level
photo at a time and names the **country**, **state or province**, and **city**. It earns a
point for each part it gets right.

**Leaderboard:** _add your Vercel URL here_

The test set (76 photos, one per city, 48 countries) is kept private so it can't leak into
training data. Only aggregate scores are published. The code (runner, scoring and
place-name matching) is open, so you can run it on your own photos.

## Results

| # | Model | Score | Country | State | City |
|---|---|---|---|---|---|
| | _filled in after the first run_ | | | | |

## How it works

- **Prompt:** one fixed prompt (`src/models.ts`, versioned with `PROMPT_VERSION`), with reasoning off unless a run says otherwise.
- **Scoring:** 1 point each for country, state and city (`src/score.ts`). Names are matched through a hand-built alias list (`src/ontology.ts`), so "Bengaluru", "Saigon" and "東京" all count.
- **Uncertainty:** each score comes with a 95% bootstrap confidence interval over the photos.
- **Refusals** score zero and are reported separately.
- **Features:** each model lists the visual features (clues) it says it used. `src/clues.ts` sorts them into types with keyword rules, and the site reports which types each model cites and how often they go with a correct answer.

Full details: `site/method.html`, or the Methodology page on the site. Planned work is in `ROADMAP.md`.

## Running it

```bash
npm install
cp .env.example .env          # add AI_GATEWAY_API_KEY
npm run import -- /path/to/batch1_2026-11-22   # adds a batch of photos to data/ (gitignored)
npm run bench -- --model anthropic/claude-opus-5-5 --dry-run --limit 3   # free check
npm run bench -- --model anthropic/claude-opus-5-5,openai/gpt-6-astra --concurrency 6
npm run site                        # writes site/data.json (totals only)
npm run dev                         # preview the site locally
```

To add photos, import another batch folder (same layout) and re-run each model: only the new
photos are sent. See `LAUNCH.md`.

Any [Vercel AI Gateway](https://vercel.com/ai-gateway) model ID works. Runs resume: if
some calls fail, run the same command again and only the failed photos are retried.
Display names live in `whereabouts.config.json`.

## Project layout

```
src/import.ts     adds a batch of photos to the private test set in data/
src/run.ts        runs models, scores answers, writes results/ (gitignored)
src/models.ts     prompt + model calls via the AI Gateway
src/score.ts      three-level scoring
src/ontology.ts   place names and aliases
src/clues.ts      clue categories
scripts/build-site.mjs   results/ → site/data.json (totals only)
site/             the static website Vercel serves
```

## What's private

`data/` (photos, answer key) and `results/` (per-photo guesses and clue text) are
gitignored. Only `site/data.json`, which holds totals, is committed and published.

## Licence

Code: MIT.
