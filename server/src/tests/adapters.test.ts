import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DefaultAdapterRegistry } from '../adapters/registry';
import { LiveProviderAdapterTemplate } from '../adapters/LiveProviderAdapterTemplate';
import { SeededDbAdapter } from '../adapters/SeededDbAdapter';
import { NotConfiguredError, type ProviderAdapter, type ProviderRef } from '../adapters/types';
import { ids, seedDatabase } from '../seed/seed';
import { TimeoutError, withTimeout } from '../services/timeout';
import { basket, pid } from './fixtures/seedExpectations';
import { useTestDb } from './helpers';

useTestDb();

const ref = (key: 'A' | 'B' | 'C', over: Partial<ProviderRef> = {}): ProviderRef => ({
  id: ids.provider(key).toHexString(),
  name: `Demo Provider ${key}`,
  slug: `demo-provider-${key.toLowerCase()}`,
  dataSourceType: 'SEED',
  officialBaseUrl: null,
  logoUrl: null,
  ...over,
});

beforeAll(async () => {
  await seedDatabase();
});

describe('SeededDbAdapter', () => {
  it('getServiceability reads the service area; a missing row is UNKNOWN, never UNAVAILABLE', async () => {
    const c = new SeededDbAdapter(ref('C'));
    expect(await c.getServiceability({ pinCode: '110001' })).toMatchObject({
      status: 'AVAILABLE',
      source: 'seed',
    });
    expect(await c.getServiceability({ pinCode: '110003' })).toMatchObject({
      status: 'UNAVAILABLE',
    });
    const none = await c.getServiceability({ pinCode: '400001' });
    expect(none).toEqual({ status: 'UNKNOWN', verifiedAt: null, source: 'seed' });
    const b = new SeededDbAdapter(ref('B'));
    expect((await b.getServiceability({ pinCode: '110002' })).status).toBe('UNKNOWN');
  });

  it('getQuote returns the latest snapshot with offers only for the requested products', async () => {
    const a = new SeededDbAdapter(ref('A'));
    const q = await a.getQuote({ pinCode: '110001' }, basket(['milk-tt-500', 1], ['eggs-6', 1]));
    expect(q).not.toBeNull();
    expect(q!.quoteId).toBe(ids.quote('A', '110001', 'latest').toHexString());
    expect(q!.offers).toHaveLength(2);
    expect(q!.offers.find((o) => o.canonicalProductId === pid('eggs-6'))).toMatchObject({
      inStock: false,
      unitPrice: 48,
      matchStatus: 'EXACT',
    });
    expect(q!.fees).toEqual({
      deliveryFee: 25,
      platformFee: 3,
      smallOrderFee: 0,
      otherFees: 0,
      taxes: 0,
    });
    expect(q!.etaMinutes).toBe(12);
  });

  it('getQuote returns null when there is no quote for the PIN', async () => {
    const b = new SeededDbAdapter(ref('B'));
    expect(await b.getQuote({ pinCode: '110002' }, basket(['milk-tt-500', 1]))).toBeNull();
  });

  it('getQuote keeps fee null versus 0 apart and includes substitute listings', async () => {
    const c = new SeededDbAdapter(ref('C'));
    const q1 = await c.getQuote({ pinCode: '110001' }, basket(['milk-fc-500', 1]));
    expect(q1!.fees.platformFee).toBeNull();
    expect(q1!.offers).toEqual([
      expect.objectContaining({ matchStatus: 'SUBSTITUTE', unitPrice: 31 }),
    ]);
    const q2 = await c.getQuote({ pinCode: '110002' }, basket(['milk-tt-500', 1]));
    expect(q2!.fees.platformFee).toBe(0);
  });

  it('getProductListings searches this provider only, case-insensitively and regex-safe', async () => {
    const a = new SeededDbAdapter(ref('A'));
    const milk = await a.getProductListings('TONED MILK', { pinCode: '110001' });
    expect(milk.map((l) => l.title).sort()).toEqual([
      'Meadow Fresh Toned Milk 1 L',
      'Meadow Fresh Toned Milk 250 ml',
      'Meadow Fresh Toned Milk 500 ml',
    ]);
    expect(await a.getProductListings('(.*', { pinCode: '110001' })).toEqual([]);
    const all = await a.getProductListings('', { pinCode: '110001' });
    expect(all).toHaveLength(41);
  });
});

describe('LiveProviderAdapterTemplate', () => {
  it('rejects every method with NotConfiguredError and names the provider', async () => {
    const t = new LiveProviderAdapterTemplate(ref('A', { dataSourceType: 'AUTHORISED_API' }));
    await expect(t.getServiceability({ pinCode: '110001' })).rejects.toBeInstanceOf(
      NotConfiguredError,
    );
    await expect(t.getQuote({ pinCode: '110001' }, [])).rejects.toThrow(
      /Demo Provider A.*not configured/,
    );
    await expect(t.getProductListings('milk', { pinCode: '110001' })).rejects.toBeInstanceOf(
      NotConfiguredError,
    );
  });
});

describe('DefaultAdapterRegistry', () => {
  it('uses the seeded adapter for SEED and MANUAL providers', () => {
    const reg = new DefaultAdapterRegistry();
    expect(reg.adapterFor(ref('A'))).toBeInstanceOf(SeededDbAdapter);
    expect(reg.adapterFor(ref('A', { dataSourceType: 'MANUAL' }))).toBeInstanceOf(SeededDbAdapter);
  });
  it('uses the NotConfigured template for AUTHORISED_API unless a live factory is set', () => {
    const reg = new DefaultAdapterRegistry();
    const p = ref('A', { dataSourceType: 'AUTHORISED_API' });
    expect(reg.adapterFor(p)).toBeInstanceOf(LiveProviderAdapterTemplate);
    const custom = {} as ProviderAdapter;
    reg.setLiveFactory(() => custom);
    expect(reg.adapterFor(p)).toBe(custom);
  });
  it('lets an override win by slug', () => {
    const custom = {} as ProviderAdapter;
    const reg = new DefaultAdapterRegistry().register('demo-provider-a', custom);
    expect(reg.adapterFor(ref('A'))).toBe(custom);
    expect(reg.adapterFor(ref('B'))).toBeInstanceOf(SeededDbAdapter);
  });
});

describe('withTimeout', () => {
  it('resolves with the value when the task is fast enough', async () => {
    await expect(withTimeout(() => Promise.resolve(42), 100, 'x')).resolves.toBe(42);
  });
  it('rejects with the task error when it fails first', async () => {
    await expect(withTimeout(() => Promise.reject(new Error('boom')), 100, 'x')).rejects.toThrow(
      'boom',
    );
  });
  it('rejects with TimeoutError naming the label and limit', async () => {
    const err = await withTimeout(() => new Promise(() => undefined), 30, 'Provider Z').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).message).toBe('Provider Z did not respond within 30 ms');
  });
  it('converts a synchronous throw into a rejection', async () => {
    await expect(
      withTimeout(
        () => {
          throw new Error('sync');
        },
        100,
        'x',
      ),
    ).rejects.toThrow('sync');
  });
  it('swallows a late failure so it cannot become an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await withTimeout(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 60)),
      20,
      'x',
    ).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 120));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
  it('clears its timer when the task finishes', async () => {
    vi.useFakeTimers();
    try {
      const p = withTimeout(() => Promise.resolve('ok'), 5000, 'x');
      await expect(p).resolves.toBe('ok');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
