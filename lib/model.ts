// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures. The base multiple is not a house
// constant: it is read off the protocols in the same category family that already trade, as the median
// of their market cap over TVL. A family with too few live members falls back to the market-wide median.
//
//   multiple   = median(mcap_usd / tvl_usd) over the family's live-token protocols, clamped
//   base       = tvl_usd x multiple
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// The family is what one thing the market prices: Lending with CDP, Dexs with DEX, Liquid Staking with
// Liquid Restaking and so on. Keying the median on the exact category string split one business into
// slivers too thin to earn a multiple of their own, so most of the board fell back to the market's.
//
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_samples: number;
  fallback_multiple: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 3,
  min_samples: 3,
  fallback_multiple: 0.25,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The base multiple one category earns, the family it was read from, and where it came from. */
export interface CategoryMultiple {
  category: string;
  family: string;
  multiple: number;
  sample_size: number;
  source: 'family-median' | 'market-median';
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    category_family: string;
    multiple_source: 'family-median' | 'market-median';
    sample_size: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_multiple: number;
  category_family: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  early: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  multiples: CategoryMultiple[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `n` held inside [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The middle value of a list of numbers (the mean of the two middles when the list is even). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The family a DefiLlama category belongs to: the business the market prices as one thing.
 *
 * DefiLlama's category strings fragment one business into a dozen labels ("Lending", "CDP", "Uncollateralized
 * Lending", "CDP Manager"), and a median over eight members of one label says less than a median over the
 * forty members of the family they all belong to. A category with no close relative is its own family, so
 * the family never widens past what a reader would call the same product.
 */
export function familyOf(category: string | null): string {
  switch (category) {
    case 'Lending':
    case 'CDP':
    case 'CDP Manager':
    case 'Uncollateralized Lending':
    case 'Collateral Markets':
      return 'Lending';
    case 'Dexs':
    case 'DEX':
    case 'Liquidity Manager':
      return 'Dexs';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
    case 'Leveraged Farming':
      return 'Yield';
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Staking Pool':
      return 'Liquid Staking';
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return 'Bridge';
    case 'Chain':
    case 'Rollup':
      return 'Chain';
    case 'RWA':
    case 'RWA Lending':
    case 'Anchor BTC':
      return 'RWA';
    case 'Derivatives':
    case 'Options':
    case 'Options Vault':
    case 'Interest Rate Derivatives':
    case 'Synthetics':
    case 'Perpetuals':
      return 'Derivatives';
    case null:
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'Curators';
    default:
      return category;
  }
}

/**
 * The base multiple every category earns, read off the snapshot's own live-token protocols.
 *
 * A protocol that trades carries a market cap; over its TVL that ratio is what the market has already
 * been willing to pay for a dollar of this kind of protocol's deposits. Taking the median per family
 * (rather than the mean) keeps one runaway token from setting the price of a whole sector. A family
 * with fewer than `min_samples` live members cannot set its own price and takes the market-wide median.
 */
export function computeMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Map<string, CategoryMultiple> {
  const byFamily = new Map<string, number[]>();
  const market: number[] = [];

  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.category === 'CEX') continue;
    if (!(p.tvl_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const key = familyOf(p.category);
    const bucket = byFamily.get(key);
    if (bucket === undefined) byFamily.set(key, [ratio]);
    else bucket.push(ratio);
    market.push(ratio);
  }

  const marketMultiple = clamp(
    market.length > 0 ? median(market) : model.fallback_multiple,
    model.multiple_floor,
    model.multiple_cap,
  );

  const out = new Map<string, CategoryMultiple>();
  /** The family's own entry, computed once per family and shared by each category inside it. */
  const families = new Map<string, CategoryMultiple>();
  for (const [family, ratios] of byFamily) {
    const own = ratios.length >= model.min_samples;
    families.set(family, {
      category: family,
      family,
      multiple: own ? clamp(median(ratios), model.multiple_floor, model.multiple_cap) : marketMultiple,
      sample_size: ratios.length,
      source: own ? 'family-median' : 'market-median',
    });
  }
  for (const [family, entry] of families) out.set(family, entry);
  // And a key per exact category, so a lookup by the row's own string finds its family's entry.
  for (const p of snapshot.protocols) {
    const category = p.category ?? '__uncategorised';
    if (out.has(category)) continue;
    const family = familyOf(p.category);
    const entry = families.get(family);
    if (entry !== undefined) out.set(category, { ...entry, category });
  }
  out.set('__market', {
    category: '__market',
    family: '__market',
    multiple: marketMultiple,
    sample_size: market.length,
    source: 'market-median',
  });
  return out;
}

/** The multiple a protocol is scored at, and where it came from. */
export function multipleFor(
  p: SnapshotProtocol,
  multiples: Map<string, CategoryMultiple>,
  model: ModelConstants = MODEL,
): CategoryMultiple {
  const key = p.category ?? '__uncategorised';
  const hit = multiples.get(key);
  if (hit !== undefined) return hit;
  const family = familyOf(p.category);
  const byFamily = multiples.get(family);
  if (byFamily !== undefined) return { ...byFamily, category: key };
  const fallback = multiples.get('__market');
  if (fallback !== undefined) return { ...fallback, category: key, family, source: 'market-median', sample_size: 0 };
  return { category: key, family, multiple: model.fallback_multiple, sample_size: 0, source: 'market-median' };
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model` and its category multiple. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiple: number,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; base: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age, base };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  multiples?: Map<string, CategoryMultiple>,
): BoardRow[] {
  const table = multiples ?? computeMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const mult = multipleFor(p, table, model);
    // Score at the same rounded multiple the board publishes, so the page's recompute is exact.
    const m4 = round4(mult.multiple);
    const r = impliedValue(p, snapshot.as_of, model, m4);
    return { p, mult, m4, ...r };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: s.m4,
      category_family: s.mult.family,
      multiple_source: s.mult.source,
      sample_size: s.mult.sample_size,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A listed chain by position, else the first the protocol names, else a neutral phrase. */
function chainAt(p: SnapshotProtocol, i: number): string {
  return p.chains[i] ?? chainOf(p);
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The plan a category's own record earns: one family per way of putting capital to work. */
export type PlanKind = 'lending' | 'dex' | 'yield' | 'rwa' | 'perps' | 'chain' | 'generic';

/**
 * The moves a category needs, from its DefiLlama label alone. A lender is not a liquidity provider, and
 * a bridge is not a vault: each family below names the risk the position actually carries.
 */
export function planKindOf(category: string | null): PlanKind {
  switch (category) {
    case 'Lending':
    case 'CDP':
    case 'CDP Manager':
    case 'Uncollateralized Lending':
    case 'Collateral Markets':
    case 'Collateral Management':
      return 'lending';
    case 'DEX':
    case 'Dexs':
    case 'Liquidity Manager':
      return 'dex';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Staking Pool':
    case 'Farm':
    case 'Leveraged Farming':
      return 'yield';
    case 'RWA':
    case 'RWA Lending':
    case 'Anchor BTC':
      return 'rwa';
    case 'Perpetuals':
    case 'Derivatives':
    case 'Options':
    case 'Options Vault':
    case 'Interest Rate Derivatives':
    case 'Synthetics':
      return 'perps';
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
    case 'Chain':
    case 'Rollup':
      return 'chain';
    default:
      return 'generic';
  }
}

/**
 * A protocol's farm plan, from its own record (category, chains, TVL, age), never from a hand-written
 * list of names. Each family carries its own moves, costs and durations; a category with no family of
 * its own keeps the generic six-step path.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const name = p.name;
  const fresh: FarmStep = {
    text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
    cost: 'under $3 of gas for the first transaction',
    time: '5 minutes',
  };
  const weekly: FarmStep = {
    text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
    cost: 'about $2 of gas a week',
    time: '10 minutes a week',
  };
  const holdStep: FarmStep = {
    text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
    cost: `the $${capital} stays in the position`,
    time: `${hold} days`,
  };
  const claim: FarmStep = {
    text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
    cost: 'no fee to check, and never pay to claim',
    time: '10 minutes',
  };
  const log: FarmStep = {
    text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
    cost: 'nothing but the log',
    time: '5 minutes',
  };

  switch (planKindOf(p.category)) {
    case 'lending':
      return [
        {
          text: `Read ${name}'s collateral list on ${chain}: note each asset's loan-to-value, its liquidation threshold and the oracle it prices from.`,
          cost: 'nothing but a read of the market page',
          time: '10 minutes',
        },
        fresh,
        {
          text: `Supply $${capital} of USDC to ${name} on ${chain} as collateral, then borrow about a third of that value in the chain's most liquid asset.`,
          cost: `$${capital} of capital and about $${gas} of gas for the two transactions`,
          time: '20 minutes',
        },
        {
          text: `Keep the health factor above 1.8, and when it drops under 2.2 repay a slice or add collateral rather than wait for the liquidation line.`,
          cost: 'about $3 of gas per adjustment',
          time: '5 minutes a week',
        },
        {
          text: `Repay a quarter of the loan every few weeks and borrow it again, so the position stays open and active without growing.`,
          cost: 'a few dollars of gas each round trip',
          time: '10 minutes twice a month',
        },
        holdStep,
        claim,
      ];

    case 'dex':
      return [
        {
          text: `Look at ${name}'s busiest pair on ${chain}: its fee tier, its depth at the current price and how far the pool has already ranged this month.`,
          cost: 'nothing to read the pool',
          time: '10 minutes',
        },
        fresh,
        {
          text: `Provide $${capital} of liquidity to that pair on ${chain} in a range about 20 per cent wide around the current price, and keep the position as a receipt token.`,
          cost: `$${capital} split across both sides, plus about $${gas} of gas`,
          time: '20 minutes',
        },
        {
          text: `Rebalance the range when price leaves it: withdraw, re-center and re-add, and count the fees each rebalance costs you.`,
          cost: 'about $2 of gas per rebalance',
          time: '15 minutes, once every two to four weeks',
        },
        {
          text: `Track impermanent loss against simply holding both assets: in a range position it is smaller while price stays inside the band and larger once it breaks out.`,
          cost: 'nothing to measure',
          time: '10 minutes a week',
        },
        {
          text: `Collect the fees you have earned before you withdraw, and keep the collection in the same wallet so the activity stays one record.`,
          cost: 'about $1 of gas per collection',
          time: '5 minutes a month',
        },
        holdStep,
      ];

    case 'yield':
      return [
        {
          text: `Open ${name}'s vault page on ${chain} and note the strategy it runs, the asset it takes and the fee it charges on yield.`,
          cost: 'nothing but a read of the vault page',
          time: '15 minutes',
        },
        {
          text: `Compare its stated APY against the underlying asset's own rate, such as the chain's staking yield or the base lending rate it sits on.`,
          cost: 'nothing to compare',
          time: '10 minutes',
        },
        fresh,
        {
          text: `Deposit $${capital} of the vault's own asset into ${name} on ${chain} and keep the shares or receipt token it issues you.`,
          cost: `$${capital} of capital and about $${gas} of gas`,
          time: '15 minutes',
        },
        {
          text: `Find the withdrawal queue before you depend on the money: how long an exit takes, whether it batches at a fixed time, and what it costs to leave early.`,
          cost: 'nothing to read the terms',
          time: '10 minutes',
        },
        {
          text: `Re-check the APY against the underlying asset every two weeks; if the vault lags what the plain asset earns, move out rather than wait.`,
          cost: 'about $3 of gas to move',
          time: '10 minutes every two weeks',
        },
        holdStep,
      ];

    case 'rwa':
      return [
        {
          text: `Read ${name}'s redemption terms before any deposit: who may redeem, on which ${chain} venue, the notice period and the fee for leaving early.`,
          cost: 'nothing but a read of the terms',
          time: '20 minutes',
        },
        {
          text: `Note the lockup and the transfer rules: whether the asset can be sold on a secondary market or only redeemed back through the issuer.`,
          cost: 'nothing to read',
          time: '10 minutes',
        },
        fresh,
        {
          text: `Check who holds the underlying asset and who audits the issuer, then buy $${capital} of ${name}'s tokenised asset on ${chain}.`,
          cost: `$${capital} of capital and about $${gas} of gas`,
          time: "25 minutes, including the issuer's own onboarding",
        },
        {
          text: `Confirm the yield actually arrives, by matching one payment against the terms you read before you put the money in.`,
          cost: 'nothing to verify',
          time: '10 minutes after the first payment',
        },
        holdStep,
        {
          text: `When you exit, start the redemption at least one full notice period before you need the funds, and keep the issuer's confirmation in your log.`,
          cost: 'the redemption fee the terms name',
          time: 'one notice period, often a week or more',
        },
      ];

    case 'perps':
      return [
        {
          text: `Read ${name}'s margin rules on ${chain}: the maintenance margin, the funding interval, the liquidation fee and which oracle sets the mark price.`,
          cost: 'nothing but a read of the docs',
          time: '15 minutes',
        },
        fresh,
        {
          text: `Deposit $${capital} of USDC as margin to ${name} and open one small position worth no more than a fifth of it.`,
          cost: `$${capital} of margin and about $${gas} of gas`,
          time: '20 minutes',
        },
        {
          text: `Keep the margin far above maintenance, at least four times the requirement, so a normal week's move cannot reach the liquidation price.`,
          cost: 'the margin stays locked in the account',
          time: 'checked daily, 2 minutes',
        },
        {
          text: `Pay attention to funding: a position held across several funding intervals costs money even when the price does not move.`,
          cost: 'the funding rate, usually a few dollars a week on this size',
          time: '5 minutes a day',
        },
        {
          text: `Close the position a few times over the holding period and open it again, so the account carries trading volume without carrying risk overnight.`,
          cost: 'about $2 of fees per round trip',
          time: '10 minutes, twice a month',
        },
        holdStep,
      ];

    case 'chain': {
      const second = chainAt(p, 1);
      const other = p.chains.indexOf(second) === 0 ? 'its second chain' : second;
      return [
        {
          text: `Bridge $${capital} of USDC onto ${chain} through ${name} from a chain you already use, and check the fee and the settlement wait before you send.`,
          cost: `$${capital} of capital, about $${gas} of gas and the bridge fee`,
          time: '15 minutes, plus the time the bridge itself takes',
        },
        fresh,
        {
          text: `Use the bridged funds on ${chain} as the chain intends: swap on one of its own venues, supply to a lender there, or hold a share of one of its pools.`,
          cost: 'about $3 of gas for two or three transactions',
          time: '20 minutes',
        },
        {
          text: `Bridge a smaller second amount later, about a tenth of the first, so the wallet shows more than one arrival rather than a single deposit.`,
          cost: 'about a tenth of the first bridge, plus its fee',
          time: '10 minutes',
        },
        {
          text: `Keep the position on ${chain} rather than bridging straight back: an address that arrives and leaves in a day is not using the chain.`,
          cost: `the $${capital} stays on ${chain}`,
          time: `${hold} days`,
        },
        {
          text: `Bridge back only through ${name} again, and record both directions so the round trip is one auditable pair of transactions.`,
          cost: 'the bridge fee on the way out',
          time: '15 minutes',
        },
        {
          text: `Check whether ${chain} or ${name} runs its own points or incentive programme, and if it does, register the wallet there before you bridge back.`,
          cost: 'nothing to register, and never pay for an airdrop',
          time: '10 minutes',
        },
        {
          text: `Keep a second chain the protocol lists, ${other}, in view, so one bridge's outage does not strand the position.`,
          cost: 'nothing to note',
          time: '5 minutes',
        },
      ];
    }

    case 'generic':
      break;
  }

  return [
    fresh,
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    weekly,
    holdStep,
    claim,
    log,
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_multiple: row.model.base_multiple,
    category_family: row.model.category_family,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    early: false,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const table = computeMultiples(snapshot, model);
  const board = buildBoard(snapshot, model, table);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    multiples: [...table.values()].sort((a, b) => b.multiple - a.multiple),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => ({ ...radarRow(r), early: !snapshot.watchlist.includes(r.slug) })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
