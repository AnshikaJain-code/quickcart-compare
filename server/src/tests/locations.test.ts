import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { Provider } from '../models';
import { seedDatabase } from '../seed/seed';
import { useTestDb } from './helpers';

useTestDb();
const app = createApp({ CLIENT_ORIGIN: 'http://localhost:5173' });

beforeAll(async () => {
  await seedDatabase();
});

describe('GET /api/v1/locations/validate', () => {
  it.each([
    ['110001', 'SUPPORTED', { available: 3, unavailable: 0, unknown: 0, total: 3 }],
    ['110002', 'SUPPORTED', { available: 2, unavailable: 0, unknown: 1, total: 3 }],
    ['110003', 'SUPPORTED', { available: 2, unavailable: 1, unknown: 0, total: 3 }],
    ['999999', 'UNSUPPORTED', { available: 0, unavailable: 3, unknown: 0, total: 3 }],
    ['400001', 'UNKNOWN', { available: 0, unavailable: 0, unknown: 3, total: 3 }],
  ])('%s is %s', async (pin, status, providers) => {
    const res = await request(app).get('/api/v1/locations/validate').query({ pinCode: pin });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pinCode: pin, status, providers, isSampleData: true });
    expect(typeof res.body.message).toBe('string');
  });

  it('does not say "not served" for a PIN we simply have no data on', async () => {
    const res = await request(app).get('/api/v1/locations/validate').query({ pinCode: '400001' });
    expect(res.body.message).toMatch(/does not mean/i);
  });

  it('trims surrounding whitespace', async () => {
    const res = await request(app).get('/api/v1/locations/validate?pinCode=%20110001%20');
    expect(res.status).toBe(200);
    expect(res.body.pinCode).toBe('110001');
  });

  it.each(['', '12345', '1234567', 'abcdef', '012345', '11 0001', '1100.1'])(
    'rejects %j with a 400',
    async (pin) => {
      const res = await request(app).get('/api/v1/locations/validate').query({ pinCode: pin });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('rejects a missing pinCode, repeated params and operator injection', async () => {
    expect((await request(app).get('/api/v1/locations/validate')).status).toBe(400);
    expect(
      (await request(app).get('/api/v1/locations/validate?pinCode=110001&pinCode=110002')).status,
    ).toBe(400);
    expect((await request(app).get('/api/v1/locations/validate?pinCode[$ne]=1')).status).toBe(400);
  });
});

describe('GET /api/v1/providers', () => {
  const get = (pin: string) => request(app).get('/api/v1/providers').query({ pinCode: pin });
  const statuses = (body: { data: { name: string; serviceability: string }[] }) =>
    Object.fromEntries(body.data.map((p) => [p.name, p.serviceability]));

  it('lists providers (sorted) with per-provider serviceability', async () => {
    const res = await get('110002');
    expect(res.status).toBe(200);
    expect(res.body.isSampleData).toBe(true);
    expect(statuses(res.body)).toEqual({
      'Demo Provider A': 'AVAILABLE',
      'Demo Provider B': 'UNKNOWN',
      'Demo Provider C': 'AVAILABLE',
    });
    expect(res.body.data[0]).toMatchObject({
      dataSourceType: 'SEED',
      officialBaseUrl: 'https://example.com/demo-provider-a',
    });
    expect(res.body.data[2].officialBaseUrl).toBeNull();
  });

  it('shows C as UNAVAILABLE at 110003 and everyone UNAVAILABLE at 999999', async () => {
    expect(statuses((await get('110003')).body)['Demo Provider C']).toBe('UNAVAILABLE');
    expect(Object.values(statuses((await get('999999')).body))).toEqual([
      'UNAVAILABLE',
      'UNAVAILABLE',
      'UNAVAILABLE',
    ]);
  });

  it('treats a PIN with no data as UNKNOWN for every provider', async () => {
    const res = await get('400001');
    expect(res.status).toBe(200);
    expect(Object.values(statuses(res.body))).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  });

  it('only lists active providers', async () => {
    await Provider.updateOne({ slug: 'demo-provider-b' }, { active: false });
    const res = await get('110001');
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual([
      'Demo Provider A',
      'Demo Provider C',
    ]);
    await Provider.updateOne({ slug: 'demo-provider-b' }, { active: true });
  });

  it('rejects missing or invalid pinCode', async () => {
    expect((await request(app).get('/api/v1/providers')).status).toBe(400);
    expect((await get('12')).status).toBe(400);
  });
});
