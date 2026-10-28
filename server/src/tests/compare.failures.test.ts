import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { DefaultAdapterRegistry } from '../adapters/registry';
import type { ProviderAdapter } from '../adapters/types';
import { Provider } from '../models';
import { seedDatabase } from '../seed/seed';
import { B1, BASKET_1 } from './fixtures/seedExpectations';
import { codes, compareOk, ENV, order, postCompare } from './helpers.compare';
import { useTestDb } from './helpers';

useTestDb();

beforeAll(async () => {
  await seedDatabase();
});

const B = 'Demo Provider B';
const C = 'Demo Provider C';
const req = { pinCode: '110001', items: BASKET_1, sortBy: 'total' };

/** An adapter for provider B that misbehaves in a chosen way. */
const failing = (overrides: Partial<ProviderAdapter>): ProviderAdapter => ({
  getServiceability: () =>
    Promise.resolve({ status: 'AVAILABLE', verifiedAt: new Date(), source: 'test' }),
  getQuote: () => Promise.resolve(null),
  getProductListings: () => Promise.resolve([]),
  ...overrides,
});

const appWith = (
  slug: string,
  adapter: ProviderAdapter,
  extra: Parameters<typeof createApp>[1] = {},
) =>
  createApp(ENV, {
    registry: new DefaultAdapterRegistry().register(slug, adapter),
    log: () => undefined,
    ...extra,
  });

describe('one provider failing never fails the comparison (CLAUDE.md rule 5)', () => {
  it('a provider that never answers times out; the others still return, with a warning', async () => {
    const app = appWith(
      'demo-provider-b',
      failing({ getServiceability: () => new Promise(() => undefined) }),
      { adapterTimeoutMs: 80 },
    );
    const started = Date.now();
    const res = await postCompare(app, req);
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(2000);
    const r = res.body;
    expect(order(r.results)).toEqual(['A']);
    expect(r.results[0].estimatedTotal).toBe(B1.total.A); // 242, unchanged by B's failure
    expect(r.unavailableProviders).toEqual([
      expect.objectContaining({ name: B, reason: 'TIMEOUT', serviceability: 'UNKNOWN' }),
    ]);
    expect(r.warnings).toContainEqual(
      expect.objectContaining({ code: 'PROVIDER_TIMEOUT', message: expect.stringContaining(B) }),
    );
  });

  it('a slow provider that still answers inside the limit is included', async () => {
    const slow: ProviderAdapter = failing({
      getServiceability: () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ status: 'UNAVAILABLE', verifiedAt: null, source: 'test' }),
            30,
          ),
        ),
    });
    const res = await compareOk(appWith('demo-provider-b', slow, { adapterTimeoutMs: 500 }), req);
    expect(res.unavailableProviders).toEqual([
      expect.objectContaining({ name: B, reason: 'NOT_SERVING' }),
    ]);
  });

  it('a provider that throws is reported without leaking the error text', async () => {
    const app = appWith(
      'demo-provider-b',
      failing({ getQuote: () => Promise.reject(new Error('secret boom: password=hunter2')) }),
    );
    const res = await postCompare(app, req);
    expect(res.status).toBe(200);
    expect(order(res.body.results)).toEqual(['A']);
    expect(res.body.unavailableProviders).toEqual([
      expect.objectContaining({ name: B, reason: 'ERROR' }),
    ]);
    expect(codes(res.body)).toContain('PROVIDER_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|secret boom/);
  });

  it('an adapter that throws synchronously is contained too', async () => {
    const app = appWith(
      'demo-provider-b',
      failing({
        getServiceability: () => {
          throw new Error('sync failure');
        },
      }),
    );
    const res = await postCompare(app, req);
    expect(res.status).toBe(200);
    expect(res.body.unavailableProviders[0]).toMatchObject({ name: B, reason: 'ERROR' });
  });

  it('a live provider with no integration reports NOT_CONFIGURED and does not break the others', async () => {
    await Provider.updateOne({ slug: 'demo-provider-b' }, { dataSourceType: 'AUTHORISED_API' });
    try {
      const res = await postCompare(createApp(ENV, { log: () => undefined }), req);
      expect(res.status).toBe(200);
      expect(order(res.body.results)).toEqual(['A']);
      expect(res.body.unavailableProviders).toEqual([
        expect.objectContaining({ name: B, reason: 'NOT_CONFIGURED' }),
      ]);
    } finally {
      await Provider.updateOne({ slug: 'demo-provider-b' }, { dataSourceType: 'SEED' });
    }
  });

  it('corrupt price data from one provider is contained to that provider', async () => {
    const bad = failing({
      getQuote: () =>
        Promise.resolve({
          quoteId: null,
          pinCode: '110001',
          fees: {},
          discounts: [],
          etaMinutes: 10,
          sourceStatus: 'SAMPLE',
          retrievedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          officialCheckoutUrl: null,
          source: 'test',
          offers: [
            {
              listingId: 'x',
              canonicalProductId: BASKET_1[0]!.productId,
              unitPrice: -5,
              inStock: true,
              matchStatus: 'EXACT',
              title: 't',
              brand: 'b',
              packSize: 'p',
            },
          ],
        }),
    });
    const res = await postCompare(appWith('demo-provider-b', bad), req);
    expect(res.status).toBe(200);
    expect(res.body.unavailableProviders).toEqual([
      expect.objectContaining({ name: B, reason: 'ERROR' }),
    ]);
    expect(order(res.body.results)).toEqual(['A']);
  });

  it('a quote whose source reports UNAVAILABLE is not ranked', async () => {
    const unavailable = failing({
      getQuote: () =>
        Promise.resolve({
          quoteId: null,
          pinCode: '110001',
          fees: {},
          discounts: [],
          etaMinutes: null,
          sourceStatus: 'UNAVAILABLE',
          offers: [],
          retrievedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          officialCheckoutUrl: null,
          source: 'test',
        }),
    });
    const res = await compareOk(appWith('demo-provider-b', unavailable), req);
    expect(res.unavailableProviders).toEqual([
      expect.objectContaining({ name: B, reason: 'QUOTE_UNAVAILABLE' }),
    ]);
  });

  it('when EVERY provider fails the API answers 502 with the reasons', async () => {
    const registry = new DefaultAdapterRegistry();
    for (const slug of ['demo-provider-a', 'demo-provider-b', 'demo-provider-c']) {
      registry.register(slug, failing({ getServiceability: () => new Promise(() => undefined) }));
    }
    const res = await postCompare(
      createApp(ENV, { registry, adapterTimeoutMs: 60, log: () => undefined }),
      req,
    );
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PROVIDERS_UNAVAILABLE');
    expect(res.body.error.details).toHaveLength(3);
    expect(res.body.error.details[0]).toMatchObject({ reason: 'TIMEOUT' });
  });

  it('a mix of failures and not-serving providers is still a 200 (not every provider failed)', async () => {
    const registry = new DefaultAdapterRegistry()
      .register(
        'demo-provider-a',
        failing({ getServiceability: () => Promise.reject(new Error('x')) }),
      )
      .register(
        'demo-provider-b',
        failing({ getServiceability: () => Promise.reject(new Error('x')) }),
      );
    const res = await postCompare(createApp(ENV, { registry, log: () => undefined }), {
      ...req,
      pinCode: '110003',
    });
    // C does not serve 110003 and A and B failed: failures (2) is not equal to providers (3)
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('logs unexpected adapter errors server-side', async () => {
    const logged: string[] = [];
    const app = appWith(
      'demo-provider-b',
      failing({ getQuote: () => Promise.reject(new Error('db down')) }),
      {
        log: (m) => void logged.push(m),
      },
    );
    await postCompare(app, req);
    expect(logged.join(' ')).toContain(B);
  });

  it('inactive providers are not queried', async () => {
    await Provider.updateOne({ slug: 'demo-provider-c' }, { active: false });
    try {
      const r = await compareOk(createApp(ENV, { log: () => undefined }), req);
      expect(
        [...r.results, ...r.unrankedResults, ...r.partialResults].map((x) => x.name),
      ).not.toContain(C);
      expect(r.unavailableProviders.map((u) => u.name)).not.toContain(C);
    } finally {
      await Provider.updateOne({ slug: 'demo-provider-c' }, { active: true });
    }
  });
});

describe('rate limiting', () => {
  it('returns 429 in the standard error shape with Retry-After once the limit is hit', async () => {
    const app = createApp(ENV, {
      rateLimits: { compare: { windowMs: 60_000, limit: 2 } },
      log: () => undefined,
    });
    expect((await postCompare(app, req)).status).toBe(200);
    expect((await postCompare(app, req)).status).toBe(200);
    const limited = await postCompare(app, req);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.stringMatching(/too many requests/i) },
    });
    expect(limited.headers['retry-after']).toBe('60');
    // other routes are not affected by the compare limit, and /health is never limited
    expect((await request(app).get('/api/v1/locations/validate?pinCode=110001')).status).toBe(200);
  });

  it('the general limit applies to every route except /health', async () => {
    const app = createApp(ENV, {
      rateLimits: { general: { windowMs: 60_000, limit: 2 } },
      log: () => undefined,
    });
    expect((await request(app).get('/api/v1/locations/validate?pinCode=110001')).status).toBe(200);
    expect((await request(app).get('/api/v1/locations/validate?pinCode=110001')).status).toBe(200);
    expect((await request(app).get('/api/v1/locations/validate?pinCode=110001')).status).toBe(429);
    for (let i = 0; i < 5; i++) expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });

  it('keeps counts per app instance (no shared state between tests)', async () => {
    const a = createApp(ENV, {
      rateLimits: { compare: { windowMs: 60_000, limit: 1 } },
      log: () => undefined,
    });
    const b = createApp(ENV, {
      rateLimits: { compare: { windowMs: 60_000, limit: 1 } },
      log: () => undefined,
    });
    expect((await postCompare(a, req)).status).toBe(200);
    expect((await postCompare(b, req)).status).toBe(200);
  });
});
