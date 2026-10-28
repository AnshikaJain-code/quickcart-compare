import type {
  EngineWarning,
  ExcludeReason,
  Rankable,
  Ranked,
  RankedBalanced,
  RankingResult,
  Weights,
} from './engineTypes';
import { toPaise } from './money';

export const DEFAULT_WEIGHTS: Weights = { priceWeight: 0.5, timeWeight: 0.5 };
const EPS = 1e-9;
const WEIGHT_TOLERANCE = 1e-6;

// ---- weights ---------------------------------------------------------------

function assertWeights(w: Weights): void {
  const { priceWeight: p, timeWeight: t } = w;
  if (![p, t].every((x) => Number.isFinite(x) && x >= 0)) {
    throw new RangeError('weights must be finite, non-negative numbers');
  }
  if (Math.abs(p + t - 1) > WEIGHT_TOLERANCE) throw new RangeError('weights must sum to 1');
}

/** Scales non-negative weights so they sum to 1 (handy for UI sliders). */
export function normalizeWeights(w: Weights): Weights {
  const { priceWeight: p, timeWeight: t } = w;
  if (![p, t].every((x) => Number.isFinite(x) && x >= 0))
    throw new RangeError('weights must be finite, non-negative numbers');
  const sum = p + t;
  if (sum <= 0) throw new RangeError('at least one weight must be greater than 0');
  return { priceWeight: p / sum, timeWeight: t / sum };
}

// ---- shared helpers ----------------------------------------------------------

const label = (r: Rankable) => r.name ?? r.providerId;
const cmp = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);
/** Known values before unknown ones. */
const cmpNullable = (a: number | null, b: number | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : cmp(a, b);
const money = (v: number | null) => (v === null ? null : toPaise(v));

/** Competition ranking: equal primary values share a rank (1, 1, 3). */
function assignRanks<T>(sorted: T[], key: (x: T) => number): (T & { rank: number })[] {
  let rank = 0;
  return sorted.map((item, i) => {
    if (i === 0 || key(item) !== key(sorted[i - 1] as T)) rank = i + 1;
    return { ...item, rank };
  });
}

function finish<T extends Rankable, R>(
  ranked: R[],
  excluded: { item: T; reason: ExcludeReason }[],
  warnings: EngineWarning[],
): RankingResult<T, R> {
  if (ranked.length === 0) {
    warnings.push({
      code: 'NO_ELIGIBLE_PROVIDERS',
      message: 'No provider could be ranked for this basket.',
    });
  }
  return { ranked, excluded, warnings };
}

function warnFor(r: Rankable, reason: ExcludeReason): EngineWarning | null {
  switch (reason) {
    case 'NULL_TOTAL':
      return {
        code: 'TOTAL_UNKNOWN',
        providerId: r.providerId,
        message: `${label(r)} was left out because its total is unknown (a fee is missing).`,
      };
    case 'UNKNOWN_ETA':
      return {
        code: 'ETA_UNKNOWN',
        providerId: r.providerId,
        message: `${label(r)} was left out because its delivery time is unknown.`,
      };
    case 'STALE_ETA':
      return {
        code: 'ETA_STALE',
        providerId: r.providerId,
        message: `${label(r)} was left out because its delivery time is out of date.`,
      };
    default:
      return null;
  }
}

/** Splits rows into included and excluded, in input order, with warnings. */
function partition<T extends Rankable>(
  items: T[],
  check: (r: T) => ExcludeReason | null,
): { included: T[]; excluded: { item: T; reason: ExcludeReason }[]; warnings: EngineWarning[] } {
  const included: T[] = [];
  const excluded: { item: T; reason: ExcludeReason }[] = [];
  const warnings: EngineWarning[] = [];
  for (const item of items) {
    const reason = !item.eligible ? 'NOT_ELIGIBLE' : check(item);
    if (reason === null) {
      included.push(item);
      continue;
    }
    excluded.push({ item, reason });
    const w = warnFor(item, reason);
    if (w) warnings.push(w);
  }
  return { included, excluded, warnings };
}

// ---- cheapest -----------------------------------------------------------------

/** Eligible providers by estimated total, ascending. Null totals are excluded (with a warning), never 0. */
export function rankCheapest<T extends Rankable>(items: T[]): RankingResult<T> {
  const { included, excluded, warnings } = partition(items, (r) =>
    r.estimatedTotal === null ? 'NULL_TOTAL' : null,
  );
  const sorted = [...included].sort(
    (a, b) =>
      cmp(money(a.estimatedTotal) as number, money(b.estimatedTotal) as number) ||
      cmpNullable(a.etaMinutes, b.etaMinutes) ||
      a.providerId.localeCompare(b.providerId),
  );
  return finish(
    assignRanks(sorted, (r) => money(r.estimatedTotal) as number) as Ranked<T>[],
    excluded,
    warnings,
  );
}

// ---- fastest ------------------------------------------------------------------

/** Eligible providers by known, non-stale ETA, ascending. An unknown ETA is excluded, never 0. */
export function rankFastest<T extends Rankable>(items: T[]): RankingResult<T> {
  const { included, excluded, warnings } = partition(items, (r) =>
    r.etaMinutes === null ? 'UNKNOWN_ETA' : r.status === 'STALE' ? 'STALE_ETA' : null,
  );
  const sorted = [...included].sort(
    (a, b) =>
      cmp(a.etaMinutes as number, b.etaMinutes as number) ||
      cmpNullable(money(a.estimatedTotal), money(b.estimatedTotal)) ||
      a.providerId.localeCompare(b.providerId),
  );
  return finish(
    assignRanks(sorted, (r) => r.etaMinutes as number) as Ranked<T>[],
    excluded,
    warnings,
  );
}

// ---- balanced -----------------------------------------------------------------

/** (x - min) / max(max - min, eps). All-equal values give 0 (no division by zero). */
function normalise(values: number[]): (x: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, EPS);
  return (x) => (x - min) / spread;
}

/**
 * score = priceWeight * priceNorm + timeWeight * timeNorm, lower is better.
 * Only providers with BOTH a total and a known non-stale ETA are scored, and normalisation is
 * over those providers only. Price and ETA are returned beside the score.
 */
export function rankBalanced<T extends Rankable>(
  items: T[],
  weights: Weights = DEFAULT_WEIGHTS,
): RankingResult<T, RankedBalanced<T>> {
  assertWeights(weights);
  const { included, excluded, warnings } = partition(items, (r) =>
    r.estimatedTotal === null
      ? 'NULL_TOTAL'
      : r.etaMinutes === null
        ? 'UNKNOWN_ETA'
        : r.status === 'STALE'
          ? 'STALE_ETA'
          : null,
  );

  const scored: (T & { score: number; priceNorm: number; timeNorm: number })[] = [];
  if (included.length > 0) {
    const price = normalise(included.map((r) => r.estimatedTotal as number));
    const time = normalise(included.map((r) => r.etaMinutes as number));
    for (const r of included) {
      const priceNorm = price(r.estimatedTotal as number);
      const timeNorm = time(r.etaMinutes as number);
      scored.push({
        ...r,
        priceNorm,
        timeNorm,
        score: weights.priceWeight * priceNorm + weights.timeWeight * timeNorm,
      });
    }
  }

  // Scores are compared after rounding away float noise.
  const key = (r: { score: number }) => Math.round(r.score * 1e9);
  scored.sort(
    (a, b) =>
      cmp(key(a), key(b)) ||
      cmp(money(a.estimatedTotal) as number, money(b.estimatedTotal) as number) ||
      cmp(a.etaMinutes as number, b.etaMinutes as number) ||
      a.providerId.localeCompare(b.providerId),
  );
  return finish(assignRanks(scored, key) as RankedBalanced<T>[], excluded, warnings);
}
