import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { ids, seedDatabase } from '../seed/seed';
import { BASKET_1 } from './fixtures/seedExpectations';
import { byName, compareOk, ENV } from './helpers.compare';
import { useTestDb } from './helpers';

useTestDb();
const app = createApp(ENV, { log: () => undefined });
const get = (id: string, a = app) => request(a).get(`/api/v1/quotes/${id}`);

beforeAll(async () => {
  await seedDatabase();
});

describe('GET /api/v1/quotes/:quoteId', () => {
  it('returns the snapshot a comparison used, in full', async () => {
    const r = await compareOk(app, { pinCode: '110001', items: BASKET_1 });
    const a = byName(r.results, 'Demo Provider A');
    const res = await get(a.quoteId!);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: a.quoteId,
      provider: { name: 'Demo Provider A', slug: 'demo-provider-a' },
      pinCode: '110001',
      currency: 'INR',
      status: 'SAMPLE',
      storedStatus: 'SAMPLE',
      isStale: false,
      isSample: true,
      etaMinutes: 12,
      fees: { deliveryFee: 25, platformFee: 3, smallOrderFee: 0, otherFees: 0, taxes: 0 },
      officialCheckoutUrl: 'https://example.com/demo-provider-a/checkout',
      source: 'seed',
    });
    expect(res.body.discounts).toEqual([
      {
        code: 'DEMO30',
        label: expect.stringContaining('30'),
        type: 'FLAT',
        value: 30,
        minOrderValue: 399,
        maxDiscount: null,
      },
    ]);
    // A lists 40 products plus 1 look-alike (UNMATCHED)
    expect(res.body.items).toHaveLength(41);
    const eggs = res.body.items.find((i: { title: string }) =>
      i.title.includes('White Eggs 6 pcs'),
    );
    expect(eggs).toMatchObject({
      inStock: false,
      unitPrice: 48,
      matchStatus: 'EXACT',
      productName: 'Eggs White 6 pcs',
    });
    const lookAlike = res.body.items.find(
      (i: { matchStatus: string }) => i.matchStatus === 'UNMATCHED',
    );
    expect(lookAlike).toMatchObject({ canonicalProductId: null, productName: null });
  });

  it('keeps unknown fees as null (not 0)', async () => {
    const res = await get(ids.quote('C', '110001', 'latest').toHexString());
    expect(res.status).toBe(200);
    expect(res.body.fees.platformFee).toBeNull();
    expect(res.body.fees.deliveryFee).toBe(35);
    expect(res.body.officialCheckoutUrl).toBeNull();
  });

  it('keeps an unknown ETA as null', async () => {
    const res = await get(ids.quote('A', '110003', 'latest').toHexString());
    expect(res.body.etaMinutes).toBeNull();
  });

  it('shows the STALE and VERIFIED quotes with the right status', async () => {
    const stale = await get(ids.quote('B', '110003', 'latest').toHexString());
    expect(stale.body).toMatchObject({
      status: 'STALE',
      storedStatus: 'STALE',
      isStale: true,
      isSample: false,
    });
    const verified = await get(ids.quote('A', '110002', 'latest').toHexString());
    expect(verified.body).toMatchObject({ status: 'VERIFIED', isSample: false });
  });

  it('can fetch the older snapshot too (quotes are append-only history)', async () => {
    const res = await get(ids.quote('A', '110001', 'older').toHexString());
    expect(res.status).toBe(200);
    expect(res.body.fees.deliveryFee).toBe(40);
  });

  it('applies staleness at read time: an expired SAMPLE quote reads as STALE but is still sample', async () => {
    const future = createApp(ENV, {
      now: () => new Date(Date.now() + 3 * 24 * 60 * 60_000),
      log: () => undefined,
    });
    const res = await get(ids.quote('A', '110001', 'latest').toHexString(), future);
    expect(res.body).toMatchObject({
      status: 'STALE',
      storedStatus: 'SAMPLE',
      isStale: true,
      isSample: true,
    });
  });

  it('answers 404 for a well-formed id that does not exist', async () => {
    const res = await get('b'.repeat(24));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Quote not found' } });
  });

  it.each(['abc', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', 'a'.repeat(25), '%20'])(
    'answers 400 for a malformed id %j',
    async (id) => {
      const res = await get(id);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );
});
