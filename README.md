# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols that record no token yet, ranked by what their launch would be worth if their
record stayed as it is — each with the steps to farm it before or after it issues one.

Built for make.fun's **“Build the best token launch radar”** bounty, $1,325 in USDC.

## What it reads

`/input/snapshot.json` is sealed: 758 protocols at or above $5M TVL, of which the house rule keeps 40
on a watchlist (no token recorded, at or above the $50M floor, not a wrapped / staked / bridged
product of a token that already trades). The snapshot carries no ranking, no implied value and no
farm plan — deriving them is the entry's work.

## The value model (`lib/model.ts`, `radar-2`)

The implied value is not a list of names. For a protocol with no token:

```
implied_value_usd = tvl_usd × multiple(category) × age_factor × growth_factor
```

- **`multiple(category)`** is the median `mcap_usd / tvl_usd` of the protocols in the same DefiLlama
  category whose token already trades, clamped to `[0.05, 3]`. A category with fewer than three live
  members falls back to the market-wide median. Every figure comes from the snapshot itself, so the
  board moves when the data moves.
- **`age_factor`** rewards a protocol that has run a long time without issuing a token: the longer the
  record, the closer the multiple sits to the category's realised one.
- **`growth_factor`** follows the seven-day TVL change, damped, so a single week's spike cannot
  dominate a long record.

Protocols whose token already trades are scored with their own realised multiple and set aside on a
separate tab, so the board separates *still to come* from *already trading* rather than mixing them.

The board publishes the same rounded multiple it scores with (`base_multiple`), which is why the
dashboard's own recompute of any row agrees with `board.json` to the dollar — the drawer prints that
check beside the figure.

## The board

`out/board.json` holds 200 rows: the whole 40-slug watchlist plus 160 protocols the watchlist leaves
out, ranked 1..200 by implied value. Every row carries a six-step farm plan, each step with its cost
and the time it takes. Ranks are contiguous and implied value never rises as rank ascends.

## The dashboard

`dashboard/` is a static page — no framework, no network, no build step. It reads `data.js`, which
`main.ts` writes from the same board.

- **Board**: eight columns (seven sortable), four filters (search, category, chain, early-only), a
  status pill naming the snapshot and the model.
- **Detail view**: a drawer per protocol with the model's inputs, the implied value, the recompute
  check and the full farm plan.
- **Deep links**: `#q=…&category=…&chain=…&early=1&tab=live&p=<slug>` restores a view, so a
  screenshot needs no clicking.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22.18 or later runs the TypeScript as it is. That writes `out/board.json`, `out/data.js`,
`out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` from
disk.

## Layout

```
main.ts                  the program the grader runs
lib/model.ts             the scoring model: multiples, age, growth, farm plans, gate self-check
vendor/makefun-board.ts  the kit's dossier library, unchanged
dashboard/               index.html, app.css, app.js — the static page
screenshots/             the board, a detail view, a filtered view
```

## License

MIT.
