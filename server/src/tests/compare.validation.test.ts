import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { seedDatabase } from '../seed/seed';
import { BASKET_1, pid } from './fixtures/seedExpectations';
import { ENV, postCompare } from './helpers.compare';
import { useTestDb } from './helpers';

useTestDb();
const app = createApp(ENV, { log: () => undefined });

beforeAll(async () => {
  await seedDatabase();
});

const valid = { pinCode: '110001', items: BASKET_1 };
const expect400 = async (body: unknown, code = 'VALIDATION_ERROR') => {
  const res = await postCompare(app, body);
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
  return res.body.error;
};
const issuePaths = (error: { details?: { path: string }[] }) =>
  (error.details ?? []).map((d) => d.path);

describe('POST /compare validation: clear 400s', () => {
  it('accepts a valid request', async () => {
    expect((await postCompare(app, valid)).status).toBe(200);
  });

  it('rejects an empty basket and a missing items field', async () => {
    const empty = await expect400({ ...valid, items: [] });
    expect(JSON.stringify(empty.details)).toMatch(/at least one item/);
    await expect400({ pinCode: '110001' });
  });

  it.each(['', '12345', '1234567', 'abcdef', '012345', '11 0001', null, 110001])(
    'rejects pinCode %j',
    async (pinCode) => {
      const error = await expect400({ ...valid, pinCode });
      expect(issuePaths(error)).toContain('pinCode');
    },
  );

  it('rejects a missing pinCode', async () => {
    await expect400({ items: BASKET_1 });
  });

  it.each([0, -1, 1.5, 21, 1000, '2', null, Number.NaN])(
    'rejects quantity %j',
    async (quantity) => {
      const error = await expect400({
        ...valid,
        items: [{ productId: pid('milk-tt-500'), quantity }],
      });
      expect(issuePaths(error)).toContain('items.0.quantity');
    },
  );

  it('accepts the quantity limits 1 and 20', async () => {
    expect(
      (
        await postCompare(app, {
          ...valid,
          items: [{ productId: pid('milk-tt-500'), quantity: 1 }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await postCompare(app, {
          ...valid,
          items: [{ productId: pid('milk-tt-500'), quantity: 20 }],
        })
      ).status,
    ).toBe(200);
  });

  it('rejects a basket with more than 25 different items, and accepts exactly 25', async () => {
    const lots = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        productId: (i + 1).toString(16).padStart(24, '0'),
        quantity: 1,
      }));
    const tooMany = await expect400({ ...valid, items: lots(26) });
    expect(JSON.stringify(tooMany.details)).toMatch(/at most 25/);
    // 25 well-formed but unknown ids gets past size validation and fails on unknown products instead
    await expect400({ ...valid, items: lots(25) }, 'UNKNOWN_PRODUCTS');
  });

  it('rejects the same product twice', async () => {
    const error = await expect400({
      ...valid,
      items: [
        { productId: pid('milk-tt-500'), quantity: 1 },
        { productId: pid('milk-tt-500').toUpperCase(), quantity: 2 },
      ],
    });
    expect(JSON.stringify(error.details)).toMatch(/only once/);
  });

  it.each(['not-an-id', '123', '', 'zzzzzzzzzzzzzzzzzzzzzzzz', null, 5])(
    'rejects malformed productId %j',
    async (productId) => {
      const error = await expect400({ ...valid, items: [{ productId, quantity: 1 }] });
      expect(issuePaths(error)).toContain('items.0.productId');
    },
  );

  it('rejects unknown product ids with UNKNOWN_PRODUCTS and names them', async () => {
    const ghost = 'a'.repeat(24);
    const error = await expect400(
      { ...valid, items: [...BASKET_1, { productId: ghost, quantity: 1 }] },
      'UNKNOWN_PRODUCTS',
    );
    expect(error.details).toEqual([{ productId: ghost }]);
    expect(error.message).toMatch(/not in the catalogue/);
  });

  it.each([
    { sortBy: 'price' },
    { sortBy: 'TOTAL' },
    { sortBy: 1 },
    { mode: 'all' },
    { mode: 'Partial' },
    { allowSubstitutes: 'yes' },
  ])('rejects %j', async (extra) => {
    await expect400({ ...valid, ...extra });
  });

  it.each([
    { priceWeight: 0.5, timeWeight: 0.6 },
    { priceWeight: 0.2, timeWeight: 0.2 },
    { priceWeight: -0.2, timeWeight: 1.2 },
    { priceWeight: 1.5, timeWeight: -0.5 },
    { priceWeight: 'a', timeWeight: 0.5 },
    { priceWeight: 1 },
    {},
  ])('rejects weights %j', async (weights) => {
    await expect400({ ...valid, sortBy: 'balance', weights });
  });

  it('accepts weights that add up to 1 even with float noise', async () => {
    expect(
      (
        await postCompare(app, {
          ...valid,
          sortBy: 'balance',
          weights: { priceWeight: 0.3, timeWeight: 0.7 },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await postCompare(app, {
          ...valid,
          sortBy: 'balance',
          weights: { priceWeight: 1, timeWeight: 0 },
        })
      ).status,
    ).toBe(200);
  });

  it('rejects unknown fields so typos do not pass silently', async () => {
    const e1 = await expect400({ ...valid, sortby: 'eta' });
    expect(JSON.stringify(e1.details)).toMatch(/sortby/);
    await expect400({
      ...valid,
      items: [{ productId: pid('milk-tt-500'), quantity: 1, extra: true }],
    });
  });

  it('rejects bodies that are not a JSON object', async () => {
    await expect400([]);
    await expect400('hello');
    await expect400(null);
    const notJson = await request(app)
      .post('/api/v1/compare')
      .set('Content-Type', 'application/json')
      .send('{broken');
    expect(notJson.status).toBe(400);
    expect(notJson.body.error.code).toBe('INVALID_JSON');
    const wrongType = await request(app)
      .post('/api/v1/compare')
      .set('Content-Type', 'text/plain')
      .send('pinCode=110001');
    expect(wrongType.status).toBe(400);
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await request(app)
      .post('/api/v1/compare')
      .send({ ...valid, padding: 'x'.repeat(150_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers 404 for the wrong method on /compare', async () => {
    expect((await request(app).get('/api/v1/compare')).status).toBe(404);
  });

  it('does not allow operator injection through the body (strings only)', async () => {
    await expect400({ ...valid, pinCode: { $ne: '' } });
    await expect400({ ...valid, items: [{ productId: { $ne: '' }, quantity: 1 }] });
  });
});
