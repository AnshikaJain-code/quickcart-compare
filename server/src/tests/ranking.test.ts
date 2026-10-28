import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  normalizeWeights,
  rankBalanced,
  rankCheapest,
  rankFastest,
} from '../services/ranking';
import {
  ALL_EQUAL,
  BALANCED,
  BALANCED_EXPECTED as BE,
  MIXED,
  row,
  SAME_PRICE,
} from './fixtures/rankingFixtures';

const ids = (r: { ranked: { providerId: string }[] }) => r.ranked.map((x) => x.providerId);
const excluded = (r: { excluded: { item: { providerId: string }; reason: string }[] }) =>
  Object.fromEntries(r.excluded.map((e) => [e.item.providerId, e.reason]));

describe('rankCheapest', () => {
  it('orders eligible providers by estimated total, ascending, with competition ranks', () => {
    const r = rankCheapest(MIXED);
    expect(ids(r)).toEqual(['F', 'D', 'B', 'A']); // 290, 305.50 (15 min), 305.50 (20 min), 320
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
  });
  it('excludes null totals (never treats them as 0) and ineligible providers, with a warning', () => {
    const r = rankCheapest(MIXED);
    expect(excluded(r)).toEqual({ C: 'NULL_TOTAL', E: 'NOT_ELIGIBLE' });
    expect(r.warnings).toEqual([
      expect.objectContaining({ code: 'TOTAL_UNKNOWN', providerId: 'C' }),
    ]);
  });
  it('STALE and SAMPLE statuses survive ranking untouched', () => {
    const r = rankCheapest(MIXED);
    expect(r.ranked.find((x) => x.providerId === 'D')!.status).toBe('STALE');
    expect(r.ranked.find((x) => x.providerId === 'A')!.status).toBe('SAMPLE');
  });
  it('a single eligible provider is ranked 1', () => {
    const r = rankCheapest([
      row({ providerId: 'A', estimatedTotal: 99 }),
      row({ providerId: 'B', eligible: false }),
    ]);
    expect(ids(r)).toEqual(['A']);
    expect(r.ranked[0]!.rank).toBe(1);
  });
  it('all ineligible: empty ranking plus a NO_ELIGIBLE_PROVIDERS warning', () => {
    const r = rankCheapest([
      row({ providerId: 'A', eligible: false }),
      row({ providerId: 'B', eligible: false }),
    ]);
    expect(r.ranked).toEqual([]);
    expect(r.excluded).toHaveLength(2);
    expect(r.warnings.map((w) => w.code)).toContain('NO_ELIGIBLE_PROVIDERS');
  });
  it('empty input is handled', () => {
    const r = rankCheapest([]);
    expect(r.ranked).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('NO_ELIGIBLE_PROVIDERS');
  });
  it('full tie on total and ETA is ordered by providerId, deterministically', () => {
    const rows = [row({ providerId: 'B' }), row({ providerId: 'A' })];
    expect(ids(rankCheapest(rows))).toEqual(['A', 'B']);
    expect(ids(rankCheapest([...rows].reverse()))).toEqual(['A', 'B']);
  });
  it('a known ETA beats an unknown one when totals tie', () => {
    const rows = [
      row({ providerId: 'A', etaMinutes: null }),
      row({ providerId: 'B', etaMinutes: 40 }),
    ];
    expect(ids(rankCheapest(rows))).toEqual(['B', 'A']);
  });
  it('does not mutate its input and preserves extra fields', () => {
    const input = MIXED.map((m) => ({ ...m, extra: m.providerId }));
    const snap = JSON.stringify(input);
    const r = rankCheapest(input);
    expect(JSON.stringify(input)).toBe(snap);
    expect(r.ranked[0]!.extra).toBe('F');
  });
});

describe('rankFastest', () => {
  it('orders by known, non-stale ETA ascending', () => {
    const r = rankFastest(MIXED);
    expect(ids(r)).toEqual(['C', 'A', 'B']); // 9, 12, 20
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it('excludes unknown ETA (never 0), STALE ETA and ineligible providers', () => {
    const r = rankFastest(MIXED);
    expect(excluded(r)).toEqual({ D: 'STALE_ETA', E: 'NOT_ELIGIBLE', F: 'UNKNOWN_ETA' });
    expect(r.warnings.map((w) => [w.code, w.providerId])).toEqual([
      ['ETA_STALE', 'D'],
      ['ETA_UNKNOWN', 'F'],
    ]);
  });
  it('an unknown ETA is not treated as 0: it cannot be first', () => {
    const r = rankFastest([
      row({ providerId: 'A', etaMinutes: null }),
      row({ providerId: 'B', etaMinutes: 45 }),
    ]);
    expect(ids(r)).toEqual(['B']);
  });
  it('a provider with a null total can still be fastest', () => {
    expect(rankFastest(MIXED).ranked[0]!.estimatedTotal).toBeNull();
  });
  it('ties on ETA share a rank and are ordered by cheaper total, then id', () => {
    const r = rankFastest([
      row({ providerId: 'A', etaMinutes: 10, estimatedTotal: 120 }),
      row({ providerId: 'B', etaMinutes: 10, estimatedTotal: 110 }),
      row({ providerId: 'C', etaMinutes: 15 }),
    ]);
    expect(ids(r)).toEqual(['B', 'A', 'C']);
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 1, 3]);
  });
  it('all ineligible gives NO_ELIGIBLE_PROVIDERS', () => {
    const r = rankFastest([row({ providerId: 'A', eligible: false })]);
    expect(r.ranked).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('NO_ELIGIBLE_PROVIDERS');
  });
});

describe('rankBalanced', () => {
  it('computes normalised price and time and returns them beside the score', () => {
    const r = rankBalanced(BALANCED, { priceWeight: 0.5, timeWeight: 0.5 });
    for (const x of r.ranked) {
      const n = BE.norms[x.providerId as 'P' | 'Q' | 'R'];
      expect(x.priceNorm).toBeCloseTo(n.price, 10);
      expect(x.timeNorm).toBeCloseTo(n.time, 10);
      expect(typeof x.estimatedTotal).toBe('number');
      expect(typeof x.etaMinutes).toBe('number');
    }
  });

  it.each([
    ['0.5/0.5', 0.5, 0.5],
    ['0.8/0.2', 0.8, 0.2],
    ['0.2/0.8', 0.2, 0.8],
    ['1/0', 1, 0],
    ['0/1', 0, 1],
  ])('weights %s give the hand-calculated scores and order', (key, wp, wt) => {
    const expected = BE.scores[key]!;
    const r = rankBalanced(BALANCED, { priceWeight: wp, timeWeight: wt });
    for (const x of r.ranked)
      expect(x.score).toBeCloseTo(expected[x.providerId as 'P' | 'Q' | 'R'], 10);
    expect(ids(r)).toEqual(expected.order);
    if (expected.ranks)
      expect(Object.fromEntries(r.ranked.map((x) => [x.providerId, x.rank]))).toEqual(
        expected.ranks,
      );
  });

  it('defaults to equal weights', () => {
    expect(DEFAULT_WEIGHTS).toEqual({ priceWeight: 0.5, timeWeight: 0.5 });
    expect(ids(rankBalanced(BALANCED))).toEqual(['R', 'P', 'Q']);
  });

  it('does not divide by zero when every value is equal: all norms and scores are 0, no NaN', () => {
    const r = rankBalanced(ALL_EQUAL, { priceWeight: 0.6, timeWeight: 0.4 });
    expect(r.ranked).toHaveLength(3);
    for (const x of r.ranked) {
      expect(x.priceNorm).toBe(0);
      expect(x.timeNorm).toBe(0);
      expect(x.score).toBe(0);
      expect(x.rank).toBe(1);
    }
    expect(ids(r)).toEqual(['X', 'Y', 'Z']);
  });

  it('when only price is equal, time decides: S2 (10), S3 (20), S1 (30)', () => {
    const r = rankBalanced(SAME_PRICE, { priceWeight: 0.5, timeWeight: 0.5 });
    expect(r.ranked.every((x) => x.priceNorm === 0)).toBe(true);
    expect(ids(r)).toEqual(['S2', 'S3', 'S1']);
  });

  it('a single eligible provider scores 0 and ranks 1', () => {
    const r = rankBalanced([row({ providerId: 'A' })]);
    expect(r.ranked[0]).toMatchObject({ providerId: 'A', score: 0, rank: 1 });
  });

  it('excludes providers that lack a total, lack an ETA, have a STALE ETA, or are ineligible', () => {
    const r = rankBalanced(MIXED);
    expect(excluded(r)).toEqual({
      C: 'NULL_TOTAL',
      D: 'STALE_ETA',
      E: 'NOT_ELIGIBLE',
      F: 'UNKNOWN_ETA',
    });
    expect(ids(r).sort()).toEqual(['A', 'B']);
    // normalised only over the included providers: A (320, 12) and B (305.5, 20)
    const a = r.ranked.find((x) => x.providerId === 'A')!;
    expect(a.priceNorm).toBeCloseTo(1, 10); // (320-305.5)/14.5
    expect(a.timeNorm).toBeCloseTo(0, 10); // (12-12)/8
  });

  it('keeps SAMPLE status on ranked items', () => {
    expect(rankBalanced(BALANCED).ranked.every((x) => x.status === 'SAMPLE')).toBe(true);
  });

  it('all ineligible gives NO_ELIGIBLE_PROVIDERS', () => {
    const r = rankBalanced([row({ providerId: 'A', eligible: false })]);
    expect(r.ranked).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('NO_ELIGIBLE_PROVIDERS');
  });

  it('rejects weights that do not sum to 1, are negative or are not finite', () => {
    for (const w of [
      { priceWeight: 0.5, timeWeight: 0.6 },
      { priceWeight: 0.2, timeWeight: 0.2 },
      { priceWeight: -0.2, timeWeight: 1.2 },
      { priceWeight: Number.NaN, timeWeight: 0.5 },
    ]) {
      expect(() => rankBalanced(BALANCED, w)).toThrow(RangeError);
    }
    expect(() => rankBalanced(BALANCED, { priceWeight: 0.3, timeWeight: 0.7 })).not.toThrow(); // float sum is 1 within tolerance
  });
});

describe('normalizeWeights', () => {
  it('scales non-negative weights so they sum to 1', () => {
    expect(normalizeWeights({ priceWeight: 3, timeWeight: 1 })).toEqual({
      priceWeight: 0.75,
      timeWeight: 0.25,
    });
    expect(normalizeWeights({ priceWeight: 1, timeWeight: 0 })).toEqual({
      priceWeight: 1,
      timeWeight: 0,
    });
  });
  it('rejects all-zero, negative and non-finite input', () => {
    expect(() => normalizeWeights({ priceWeight: 0, timeWeight: 0 })).toThrow(RangeError);
    expect(() => normalizeWeights({ priceWeight: -1, timeWeight: 2 })).toThrow(RangeError);
    expect(() =>
      normalizeWeights({ priceWeight: Number.POSITIVE_INFINITY, timeWeight: 1 }),
    ).toThrow(RangeError);
  });
});
