import { describe, expect, it } from 'vitest';
import { computeCoverage, isEligible, type Offer } from '../services/pricing';
import { BASKET } from './fixtures/pricingFixtures';

const offer = (productId: string, o: Partial<Offer> = {}): Offer => ({
  listingId: `L-${productId}`,
  canonicalProductId: productId,
  unitPrice: 10,
  inStock: true,
  matchStatus: 'EXACT',
  ...o,
});

describe('computeCoverage', () => {
  it('full coverage: every line has an in-stock EXACT offer', () => {
    // lines: p1 50*2=100, p2 20*1=20, p3 15*1=15, p4 10*3=30
    const r = computeCoverage(BASKET, [
      offer('p1', { unitPrice: 50 }),
      offer('p2', { unitPrice: 20 }),
      offer('p3', { unitPrice: 15 }),
      offer('p4', { unitPrice: 10 }),
    ]);
    expect(r).toMatchObject({
      requestedCount: 4,
      availableCount: 4,
      coverage: 1,
      isComplete: true,
      missing: [],
    });
    expect(r.lines.map((l) => l.lineTotal)).toEqual([100, 20, 15, 30]);
    expect(r.lines.every((l) => !l.usedSubstitute)).toBe(true);
  });

  it('partial coverage = available matched lines / requested lines, with a reason per missing line', () => {
    // p1 ok (EXACT). p2 EXACT but out of stock. p3 only LIKELY. p4 only SUBSTITUTE (no opt-in).
    const r = computeCoverage(BASKET, [
      offer('p1'),
      offer('p2', { inStock: false }),
      offer('p3', { matchStatus: 'LIKELY' }),
      offer('p4', { matchStatus: 'SUBSTITUTE' }),
    ]);
    expect(r.availableCount).toBe(1);
    expect(r.coverage).toBe(0.25); // 1 of 4
    expect(r.isComplete).toBe(false);
    expect(Object.fromEntries(r.missing.map((m) => [m.productId, m.reason]))).toEqual({
      p2: 'OUT_OF_STOCK',
      p3: 'UNCONFIRMED_MATCH',
      p4: 'SUBSTITUTE_NOT_ALLOWED',
    });
  });

  it('a product the provider does not list at all is NOT_LISTED', () => {
    const r = computeCoverage(BASKET, [offer('p1'), offer('p2'), offer('p3')]);
    expect(r.missing).toEqual([{ productId: 'p4', quantity: 3, reason: 'NOT_LISTED' }]);
    expect(r.coverage).toBe(0.75); // 3 of 4
  });

  it('substitutes count only when the shopper opts in, and are flagged', () => {
    const offers = [
      offer('p1'),
      offer('p2'),
      offer('p3'),
      offer('p4', { matchStatus: 'SUBSTITUTE', unitPrice: 20 }),
    ];
    expect(computeCoverage(BASKET, offers).coverage).toBe(0.75);
    const r = computeCoverage(BASKET, offers, { allowSubstitutes: true });
    expect(r.coverage).toBe(1);
    const p4 = r.lines.find((l) => l.productId === 'p4')!;
    expect(p4).toMatchObject({ usedSubstitute: true, matchStatus: 'SUBSTITUTE', lineTotal: 60 }); // 20*3
  });

  it('prefers EXACT over SUBSTITUTE; falls back to a substitute only if the exact one is out of stock', () => {
    const both = computeCoverage(
      [{ productId: 'p1', quantity: 1 }],
      [
        offer('p1', { listingId: 'sub', matchStatus: 'SUBSTITUTE', unitPrice: 5 }),
        offer('p1', { listingId: 'exact', unitPrice: 9 }),
      ],
      { allowSubstitutes: true },
    );
    expect(both.lines[0]).toMatchObject({ listingId: 'exact', usedSubstitute: false });
    const fallback = computeCoverage(
      [{ productId: 'p1', quantity: 1 }],
      [
        offer('p1', { listingId: 'sub', matchStatus: 'SUBSTITUTE', unitPrice: 5 }),
        offer('p1', { listingId: 'exact', inStock: false }),
      ],
      { allowSubstitutes: true },
    );
    expect(fallback.lines[0]).toMatchObject({ listingId: 'sub', usedSubstitute: true });
  });

  it('with several in-stock EXACT offers it picks the lowest price (ties by listingId)', () => {
    const r = computeCoverage(
      [{ productId: 'p1', quantity: 1 }],
      [
        offer('p1', { listingId: 'b', unitPrice: 12 }),
        offer('p1', { listingId: 'a', unitPrice: 12 }),
        offer('p1', { listingId: 'c', unitPrice: 11 }),
      ],
    );
    expect(r.lines[0]!.listingId).toBe('c');
    const tie = computeCoverage(
      [{ productId: 'p1', quantity: 1 }],
      [
        offer('p1', { listingId: 'b', unitPrice: 12 }),
        offer('p1', { listingId: 'a', unitPrice: 12 }),
      ],
    );
    expect(tie.lines[0]!.listingId).toBe('a');
  });

  it('ignores offers without a canonical product', () => {
    const r = computeCoverage(
      [{ productId: 'p1', quantity: 1 }],
      [offer('p1', { canonicalProductId: null })],
    );
    expect(r.availableCount).toBe(0);
    expect(r.missing[0]!.reason).toBe('NOT_LISTED');
  });

  it('merges duplicate basket lines by summing quantities', () => {
    const r = computeCoverage(
      [
        { productId: 'p1', quantity: 1 },
        { productId: 'p1', quantity: 2 },
      ],
      [offer('p1', { unitPrice: 10 })],
    );
    expect(r.requestedCount).toBe(1);
    expect(r.lines[0]).toMatchObject({ quantity: 3, lineTotal: 30 });
  });

  it('computes line totals without float drift', () => {
    const r = computeCoverage(
      [{ productId: 'p1', quantity: 3 }],
      [offer('p1', { unitPrice: 0.1 })],
    );
    expect(r.lines[0]!.lineTotal).toBe(0.3); // not 0.30000000000000004
  });

  it('rejects an empty basket and invalid quantities', () => {
    expect(() => computeCoverage([], [])).toThrow(RangeError);
    for (const q of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeCoverage([{ productId: 'p1', quantity: q }], [])).toThrow(RangeError);
    }
  });

  it('rejects invalid prices instead of pricing with them', () => {
    for (const p of [-1, Number.NaN]) {
      expect(() =>
        computeCoverage([{ productId: 'p1', quantity: 1 }], [offer('p1', { unitPrice: p })]),
      ).toThrow(RangeError);
    }
  });

  it('does not mutate its inputs', () => {
    const basket = [{ productId: 'p1', quantity: 2 }];
    const offers = [offer('p1')];
    const snap = JSON.stringify([basket, offers]);
    computeCoverage(basket, offers);
    expect(JSON.stringify([basket, offers])).toBe(snap);
  });
});

describe('isEligible', () => {
  const cov = (available: number) =>
    computeCoverage(
      BASKET,
      BASKET.slice(0, available).map((b) => offer(b.productId)),
    );
  it('full-basket mode needs coverage of exactly 1', () => {
    expect(isEligible(cov(4), 'full-basket')).toBe(true);
    expect(isEligible(cov(3), 'full-basket')).toBe(false);
    expect(isEligible(cov(0), 'full-basket')).toBe(false);
  });
  it('partial mode needs at least one available item', () => {
    expect(isEligible(cov(1), 'partial')).toBe(true);
    expect(isEligible(cov(0), 'partial')).toBe(false);
  });
});
