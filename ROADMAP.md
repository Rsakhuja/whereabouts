# Roadmap

v1 measures one thing well: naming a place from a street photo. These are the planned next steps.

## A bigger test set (next)

Grow from 76 to about 300 hand-picked photos, screened against the same written criteria and
chosen before any model sees them. More photos narrow the confidence ranges: roughly ±8 points
today, about ±4 at 300. New photos are added in batches. Each model is then run on the new
photos only, since every photo is scored independently with the same prompt.

## Checking claimed clues (planned)

Label each clue a model cites as present, absent or unverifiable in the photo, and report a
false-clue rate next to accuracy. In earlier experiments, models confidently misread street
signs and misidentified landmarks. That's worth measuring directly, not just anecdotally.

## More models and model progression (ongoing)

Add smaller models from each family, open-weight models and reasoning-on runs. Then trace
successive generations from the same lab to show how geolocation ability has changed over time.
The prompt and test set are versioned, so models added later are scored on exactly the same task.

## Distance scoring (later)

Record each photo's coordinates when it is captured, then report how far off each guess is in
kilometres, alongside the three-level score.
