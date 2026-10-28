import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { ids } from '../seed/ids';
import { seedDatabase } from '../seed/seed';
import {
  B1,
  B2,
  BASKET_1,
  BASKET_2,
  BASKET_O,
  BASKET_P,
  BASKET_S,
  BO,
  BP,
  BS,
} from './fixtures/seedExpectations';
import { byName, codes, compareOk, ENV, order, ranks } from './helpers.compare';
import { useTestDb } from './helpers';

useTestDb();
const app = createApp(ENV, { log: () => undefined });

beforeAll(async () => {
  await seedDatabase();
});

const A = 'Demo Provider A';
const B = 'Demo Provider B';
const C = 'Demo Provider C';

describe('POST /compare: totals equal the hand-calculated values on the seeded data', () => {
  it('PIN 110001, basket 1, cheapest first', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1, sortBy: 'total' });
    expect(order(r.results)).toEqual(['A', 'B']);
    expect(ranks(r.results)).toEqual([1, 2]);

    const a = byName(r.results, A);
    expect(a.itemSubtotal).toBe(B1.subtotal.A); // 214
    expect(a.estimatedTotal).toBe(B1.total.A); // 242
    expect(a.fees).toEqual({
      deliveryFee: 25,
      platformFee: 3,
      smallOrderFee: 0,
      otherFees: 0,
      taxes: 0,
    });
    expect(a.knownFeesTotal).toBe(28);
    expect(a.discountTotal).toBe(0); // 214 < 399
    expect(a.skippedDiscounts).toEqual([expect.objectContaining({ reason: 'MIN_ORDER_NOT_MET' })]);
    expect(a.etaMinutes).toBe(B1.eta.A);

    const b = byName(r.results, B);
    expect(b.itemSubtotal).toBe(B1.subtotal.B); // 216
    expect(b.estimatedTotal).toBe(B1.total.B); // 246
    expect(b.fees).toEqual({
      deliveryFee: 0,
      platformFee: 10,
      smallOrderFee: 20,
      otherFees: 0,
      taxes: 0,
    });
    expect(b.etaMinutes).toBe(B1.eta.B);
  });

  it('an unknown fee gives a null total, never 0, and the provider is listed as unranked with the reason', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1, sortBy: 'total' });
    expect(r.results.map((x) => x.name)).not.toContain(C);
    const c = byName(r.unrankedResults, C);
    expect(c.unrankedReason).toBe('NULL_TOTAL');
    expect(c.estimatedTotal).toBeNull();
    expect(c.totalIncomplete).toBe(true);
    expect(c.unknownFees).toEqual(['platformFee']);
    expect(c.fees.platformFee).toBeNull();
    expect(c.fees.deliveryFee).toBe(35);
    expect(c.itemSubtotal).toBe(B1.subtotal.C); // 211, still shown
    expect(codes(r)).toContain('TOTAL_INCOMPLETE');
    expect(codes(r)).toContain('TOTAL_UNKNOWN');
  });

  it('PIN 110002, basket 2: a discount that applies (C: 339 + 50 - 20 = 369) and a VERIFIED quote', async () => {
    const r = await compareOk(app, { pinCode: '110002', items: BASKET_2, sortBy: 'total' });
    expect(order(r.results)).toEqual(['A', 'C']);
    const a = byName(r.results, A);
    const c = byName(r.results, C);
    expect([a.estimatedTotal, c.estimatedTotal]).toEqual([
      B2.at110002.total.A,
      B2.at110002.total.C,
    ]); // 363, 369
    expect(c.itemSubtotal).toBe(B2.subtotal.C);
    expect(c.discountTotal).toBe(20);
    expect(c.appliedDiscounts).toEqual([expect.objectContaining({ amount: 20 })]);
    expect(c.fees).toEqual({
      deliveryFee: 30,
      platformFee: 0,
      smallOrderFee: 15,
      otherFees: 5,
      taxes: 0,
    });
    expect(a.status).toBe('VERIFIED');
  });

  it('PIN 110003, basket 2: a STALE quote is cheapest but is labelled STALE with a warning', async () => {
    const r = await compareOk(app, { pinCode: '110003', items: BASKET_2, sortBy: 'total' });
    expect(order(r.results)).toEqual(['B', 'A']);
    const b = byName(r.results, B);
    const a = byName(r.results, A);
    expect([b.estimatedTotal, a.estimatedTotal]).toEqual([
      B2.at110003.total.B,
      B2.at110003.total.A,
    ]); // 371, 373
    expect(b).toMatchObject({ status: 'STALE', storedStatus: 'STALE', isStale: true });
    expect(a).toMatchObject({ status: 'SAMPLE', isSample: true, isStale: false });
    expect(r.warnings).toContainEqual(
      expect.objectContaining({ code: 'STALE_QUOTE', providerId: b.providerId }),
    );
  });

  it('uses the LATEST quote snapshot, not the older one for the same PIN', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1, sortBy: 'total' });
    const a = byName(r.results, A);
    expect(a.fees.deliveryFee).toBe(25); // the older snapshot had 40
    expect(a.quoteId).toBe(ids.quote('A', '110001', 'latest').toHexString());
  });
});

describe('POST /compare: sortBy reorders correctly', () => {
  it('eta: fastest first, and a provider with an unknown total can still be fastest', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1, sortBy: 'eta' });
    expect(order(r.results)).toEqual(['C', 'A', 'B']); // 9, 12, 20
    expect(r.results.map((x) => x.etaMinutes)).toEqual([9, 12, 20]);
    expect(r.results[0]!.estimatedTotal).toBeNull();
  });

  it('eta: unknown and STALE ETAs are excluded, never treated as 0', async () => {
    const r = await compareOk(app, { pinCode: '110003', items: BASKET_2, sortBy: 'eta' });
    expect(r.results).toEqual([]);
    expect(r.unrankedResults.map((x) => [x.name, x.unrankedReason])).toEqual([
      [A, 'UNKNOWN_ETA'],
      [B, 'STALE_ETA'],
    ]);
    expect(codes(r)).toEqual(
      expect.arrayContaining(['ETA_UNKNOWN', 'ETA_STALE', 'NO_ELIGIBLE_PROVIDERS']),
    );
  });

  it('total vs eta vs balance give different orders on 110002 / basket 2', async () => {
    const req = { pinCode: '110002', items: BASKET_2 };
    expect(order((await compareOk(app, { ...req, sortBy: 'total' })).results)).toEqual(['A', 'C']);
    expect(order((await compareOk(app, { ...req, sortBy: 'eta' })).results)).toEqual(['C', 'A']);
    const priceHeavy = await compareOk(app, {
      ...req,
      sortBy: 'balance',
      weights: { priceWeight: 0.8, timeWeight: 0.2 },
    });
    const timeHeavy = await compareOk(app, {
      ...req,
      sortBy: 'balance',
      weights: { priceWeight: 0.2, timeWeight: 0.8 },
    });
    expect(order(priceHeavy.results)).toEqual(['A', 'C']);
    expect(order(timeHeavy.results)).toEqual(['C', 'A']);
  });

  it('balance returns price, ETA and the hand-calculated score side by side', async () => {
    const r = await compareOk(app, {
      pinCode: '110002',
      items: BASKET_2,
      sortBy: 'balance',
      weights: { priceWeight: 0.2, timeWeight: 0.8 },
    });
    expect(r.weights).toEqual({ priceWeight: 0.2, timeWeight: 0.8 });
    const a = byName(r.results, A);
    const c = byName(r.results, C);
    expect(a.score).toBeCloseTo(B2.at110002.balance['0.2/0.8'].A, 6); // 0.8
    expect(c.score).toBeCloseTo(B2.at110002.balance['0.2/0.8'].C, 6); // 0.2
    expect(a.priceNorm).toBeCloseTo(0, 6);
    expect(a.timeNorm).toBeCloseTo(1, 6);
    expect(c.priceNorm).toBeCloseTo(1, 6);
    expect(c.timeNorm).toBeCloseTo(0, 6);
    expect([a.estimatedTotal, a.etaMinutes, c.estimatedTotal, c.etaMinutes]).toEqual([
      363, 15, 369, 11,
    ]);
  });

  it('balance defaults to equal weights; a tie shares a rank and the cheaper total is listed first', async () => {
    const r = await compareOk(app, { pinCode: '110002', items: BASKET_2, sortBy: 'balance' });
    expect(r.weights).toEqual({ priceWeight: 0.5, timeWeight: 0.5 });
    expect(order(r.results)).toEqual(['A', 'C']);
    expect(ranks(r.results)).toEqual([1, 1]);
    expect(r.results.every((x) => Math.abs((x.score ?? 0) - 0.5) < 1e-6)).toBe(true);
  });

  it('weights are only echoed when sortBy is balance', async () => {
    const r = await compareOk(app, {
      pinCode: '110002',
      items: BASKET_2,
      sortBy: 'total',
      weights: { priceWeight: 0.5, timeWeight: 0.5 },
    });
    expect(r.weights).toBeNull();
    expect(r.results[0]).not.toHaveProperty('score');
  });

  it('defaults are sortBy total and mode full-basket', async () => {
    const r = await compareOk(app, { pinCode: '110002', items: BASKET_2 });
    expect(r).toMatchObject({ sortBy: 'total', mode: 'full-basket', allowSubstitutes: false });
  });
});

describe('POST /compare: partial baskets', () => {
  it('full-basket mode: a provider missing an item is in partialResults, not in the rankings', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_P, sortBy: 'total' });
    expect(order(r.results)).toEqual(['A']);
    expect(byName(r.results, A).estimatedTotal).toBe(BP.A.total); // 203
    expect(r.results.map((x) => x.name)).not.toContain(B);

    expect(order(r.partialResults)).toEqual(['B']);
    const b = byName(r.partialResults, B);
    expect(b.coverage).toBeCloseTo(BP.B.coverage, 10);
    expect(b.availableCount).toBe(2);
    expect(b.requestedCount).toBe(3);
    expect(b.isComplete).toBe(false);
    expect(b.missingItems).toEqual([
      expect.objectContaining({ name: 'Pav Buns 4 pcs', quantity: 1, reason: 'NOT_LISTED' }),
    ]);
    expect(codes(r)).toContain('MISSING_ITEMS');
    // C is complete but has an unknown fee: unranked, not partial
    expect(byName(r.unrankedResults, C).unrankedReason).toBe('NULL_TOTAL');
  });

  it('partial mode: incomplete baskets are ranked, flagged and warned about', async () => {
    const r = await compareOk(app, {
      pinCode: '110001',
      items: BASKET_P,
      sortBy: 'total',
      mode: 'partial',
    });
    expect(order(r.results)).toEqual(['B', 'A']);
    expect(byName(r.results, B).estimatedTotal).toBe(BP.B.total); // 178
    expect(byName(r.results, B).isComplete).toBe(false);
    expect(byName(r.results, A).estimatedTotal).toBe(BP.A.total); // 203
    expect(r.partialResults).toEqual([]);
    expect(r.warnings).toContainEqual(
      expect.objectContaining({
        code: 'PARTIAL_BASKET',
        providerId: byName(r.results, B).providerId,
      }),
    );
  });

  it('an out-of-stock item makes that provider partial with reason OUT_OF_STOCK', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_O, sortBy: 'total' });
    expect(order(r.results)).toEqual(['B']);
    expect(byName(r.results, B).estimatedTotal).toBe(BO.B.total); // 108
    const a = byName(r.partialResults, A);
    expect(a.coverage).toBe(0.5);
    expect(a.missingItems).toEqual([
      expect.objectContaining({ name: 'Eggs White 6 pcs', reason: 'OUT_OF_STOCK' }),
    ]);
  });

  it('substitutes are used only when the shopper opts in', async () => {
    const req = { pinCode: '110002', items: BASKET_S, sortBy: 'total' };
    const without = await compareOk(app, req);
    expect(order(without.results)).toEqual(['A']);
    expect(byName(without.partialResults, C).missingItems).toEqual([
      expect.objectContaining({ reason: 'SUBSTITUTE_NOT_ALLOWED' }),
    ]);

    const withOptIn = await compareOk(app, { ...req, allowSubstitutes: true });
    expect(withOptIn.allowSubstitutes).toBe(true);
    expect(order(withOptIn.results)).toEqual(['A', 'C']);
    expect(byName(withOptIn.results, A).estimatedTotal).toBe(BS.A.total); // 174
    const c = byName(withOptIn.results, C);
    expect(c.estimatedTotal).toBe(BS.C.total); // 196
    expect(c.itemSubtotal).toBe(BS.C.subtotal); // 146
    expect(c.lines.find((l) => l.usedSubstitute)).toMatchObject({
      unitPrice: 31,
      listingTitle: 'Daily Value Full Cream Milk 500 ml',
    });
    expect(codes(withOptIn)).toContain('SUBSTITUTE_USED');
  });
});

describe('POST /compare: PIN states', () => {
  it('an unsupported PIN: 200, no rankings, every provider NOT_SERVING (UNAVAILABLE), PIN_UNSUPPORTED', async () => {
    const r = await compareOk(app, { pinCode: '999999', items: BASKET_1 });
    expect(r.results).toEqual([]);
    expect(r.partialResults).toEqual([]);
    expect(r.unavailableProviders.map((u) => [u.reason, u.serviceability])).toEqual([
      ['NOT_SERVING', 'UNAVAILABLE'],
      ['NOT_SERVING', 'UNAVAILABLE'],
      ['NOT_SERVING', 'UNAVAILABLE'],
    ]);
    expect(codes(r)).toContain('PIN_UNSUPPORTED');
    expect(codes(r)).toContain('NO_ELIGIBLE_PROVIDERS');
    expect(codes(r)).not.toContain('PIN_UNKNOWN');
  });

  it('a PIN with no data is UNKNOWN, which is different from unsupported', async () => {
    const r = await compareOk(app, { pinCode: '400001', items: BASKET_1 });
    expect(r.results).toEqual([]);
    expect(r.unavailableProviders.map((u) => [u.reason, u.serviceability])).toEqual([
      ['NO_QUOTE', 'UNKNOWN'],
      ['NO_QUOTE', 'UNKNOWN'],
      ['NO_QUOTE', 'UNKNOWN'],
    ]);
    expect(codes(r)).toContain('PIN_UNKNOWN');
    expect(codes(r)).not.toContain('PIN_UNSUPPORTED');
    expect(r.unavailableProviders[0]!.message).toMatch(/does not mean/i);
  });

  it('a provider with UNKNOWN coverage and no quote is NO_QUOTE (UNKNOWN), a non-serving one is NOT_SERVING (UNAVAILABLE)', async () => {
    const r110002 = await compareOk(app, { pinCode: '110002', items: BASKET_2 });
    expect(r110002.unavailableProviders).toEqual([
      expect.objectContaining({ name: B, serviceability: 'UNKNOWN', reason: 'NO_QUOTE' }),
    ]);
    const r110003 = await compareOk(app, { pinCode: '110003', items: BASKET_2 });
    expect(r110003.unavailableProviders).toEqual([
      expect.objectContaining({ name: C, serviceability: 'UNAVAILABLE', reason: 'NOT_SERVING' }),
    ]);
  });
});

describe('POST /compare: demo data, links, basket, status', () => {
  it('always flags sample data with isSampleData and a DEMO_DATA warning', async () => {
    for (const pin of ['110001', '110002', '110003', '999999', '400001']) {
      const r = await compareOk(app, { pinCode: pin, items: BASKET_1 });
      expect(r.isSampleData).toBe(true);
      expect(r.warnings[0]).toMatchObject({ code: 'DEMO_DATA' });
    }
  });

  it('SAMPLE and STALE statuses are present on every result', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1 });
    for (const x of [...r.results, ...r.unrankedResults]) {
      expect(x.status).toBe('SAMPLE');
      expect(x.storedStatus).toBe('SAMPLE');
      expect(x.isSample).toBe(true);
      expect(typeof x.retrievedAt).toBe('string');
      expect(typeof x.etaAsOf).toBe('string');
    }
  });

  it('official links are only returned when valid, never invented', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1 });
    expect(byName(r.results, A).officialLink).toBe('https://example.com/demo-provider-a/checkout');
    expect(byName(r.unrankedResults, C).officialLink).toBeNull();
  });

  it('echoes the basket with readable names and pack sizes', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1 });
    expect(r.basket).toEqual([
      expect.objectContaining({
        name: 'Milk',
        brand: 'Meadow Fresh',
        packLabel: '500 ml',
        quantity: 2,
      }),
      expect.objectContaining({ name: 'Sandwich Bread', packLabel: '400 g', quantity: 1 }),
      expect.objectContaining({ name: 'Basmati Rice', packLabel: '1 kg', quantity: 1 }),
    ]);
  });

  it('accepts product ids in upper case', async () => {
    const items = BASKET_1.map((i) => ({ ...i, productId: i.productId.toUpperCase() }));
    const r = await compareOk(app, { pinCode: '110001', items });
    expect(order(r.results)).toEqual(['A', 'B']);
  });

  it('is deterministic: the same request twice gives the same results', async () => {
    const body = { pinCode: '110002', items: BASKET_2, sortBy: 'balance' };
    const strip = (r: Awaited<ReturnType<typeof compareOk>>) => ({ ...r, generatedAt: '' });
    expect(strip(await compareOk(app, body))).toEqual(strip(await compareOk(app, body)));
  });

  it('an age threshold marks a SAMPLE quote STALE while remembering it is sample data', async () => {
    const later = createApp(ENV, {
      now: () => new Date(Date.now() + 2 * 60 * 60_000),
      staleAfterMinutes: 60,
      log: () => undefined,
    });
    const r = await compareOk(later, { pinCode: '110001', items: BASKET_1 });
    const a = byName(r.results, A);
    expect(a).toMatchObject({
      status: 'STALE',
      storedStatus: 'SAMPLE',
      isStale: true,
      isSample: true,
    });
  });

  it('three days later every quote has expired and shows as STALE (VERIFIED too)', async () => {
    const future = createApp(ENV, {
      now: () => new Date(Date.now() + 3 * 24 * 60 * 60_000),
      log: () => undefined,
    });
    const r = await compareOk(future, { pinCode: '110002', items: BASKET_2 });
    expect(r.results.every((x) => x.status === 'STALE' && x.isStale)).toBe(true);
    expect(byName(r.results, A).storedStatus).toBe('VERIFIED');
    expect(codes(r).filter((c) => c === 'STALE_QUOTE')).toHaveLength(2);
  });
});
