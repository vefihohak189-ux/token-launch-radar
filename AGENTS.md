# token-radar

The make.fun token-radar-01 entry: a Node 22 program (main.ts, standard library only) that ranks
pre-token DeFi protocols by implied value and writes out/board.json, data.js, the dashboard and a dossier.

## Status

Updated 2026-11-26: model `radar-3` builds clean (exit 0), 200 rows, 17 of them on the market-median
fallback. `dashboard/app.js` re-derives the same farm plans the board carries; keep the two in step, a
test compares them row by row. Screenshots were last retaken at this commit.

## Run

    MAKEFUN_OUTPUT_DIR=out node main.ts --input "<kit>/input/snapshot.json"

The build exits 1 and names the row when boardIssue() finds a broken gate rule. Node cannot parse a
single-quoted string that contains an apostrophe, and it fails on the line after the real one.

## Map

- lib/model.ts: MODEL constants, familyOf(), computeMultiples(), planKindOf(), farmSteps().
- dashboard/app.js: recompute(), familyOf(), farmSteps() mirror model.ts; the drawer shows its own plan.
- Screenshots come from headless Chrome with a hash deep link (#p=<slug>, #category=<Category>).

## Decisions

- The multiple is taken per category family, not per exact DefiLlama category, so a thin label inherits
  its family's realised median instead of the market's.
- farm_steps is generated from category, chains, TVL and age only; any chain a step names must be in the
  protocol's own `chains`.
