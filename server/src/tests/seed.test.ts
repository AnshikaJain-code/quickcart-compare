import { beforeAll, describe, expect, it } from 'vitest';
import { CanonicalProduct, Provider, ProviderListing, Quote, ServiceArea } from '../models';
import { ids, seedDatabase } from '../seed/seed';
import { useTestDb } from './helpers';

useTestDb();

describe('seed', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  it('is idempotent: running twice gives the same counts and the same ids', async () => {
    const before = {
      products: (await CanonicalProduct.find().sort({ _id: 1 }).lean()).map((d) => String(d._id)),
      quotes: (await Quote.find().sort({ _id: 1 }).lean()).map((d) => String(d._id)),
    };
    const summary = await seedDatabase();
    const after = {
      products: (await CanonicalProduct.find().sort({ _id: 1 }).lean()).map((d) => String(d._id)),
      quotes: (await Quote.find().sort({ _id: 1 }).lean()).map((d) => String(d._id)),
    };
    expect(after).toEqual(before);
    expect(summary).toEqual({
      providers: 3,
      serviceAreas: 12,
      products: 40,
      listings: 119,
      quotes: 8,
    });
  });

  it('creates three fictional providers marked as SEED data', async () => {
    const providers = await Provider.find().sort({ name: 1 }).lean();
    expect(providers.map((p) => p.name)).toEqual([
      'Demo Provider A',
      'Demo Provider B',
      'Demo Provider C',
    ]);
    expect(providers.every((p) => p.dataSourceType === 'SEED')).toBe(true);
  });

  it('has about 40 products and keeps pack sizes as separate products', async () => {
    const milk = await CanonicalProduct.find({ name: 'Milk', variant: 'Toned' }).lean();
    expect(milk.map((m) => m.packLabel).sort()).toEqual(['1 L', '500 ml']);
    const cola = await CanonicalProduct.find({ name: 'Cola' }).lean();
    expect(cola.map((m) => m.baseUnit)).toEqual(['ml', 'ml']);
    expect(cola.map((m) => m.quantityBase).sort((a, b) => a - b)).toEqual([750, 2250]);
  });

  it('covers the required PIN scenarios', async () => {
    const status = async (provider: 'A' | 'B' | 'C', pin: string) =>
      (await ServiceArea.findOne({ providerId: ids.provider(provider), pinCode: pin }).lean())
        ?.status;
    expect(await status('B', '110002')).toBe('UNKNOWN');
    expect(await status('C', '110003')).toBe('UNAVAILABLE');
    expect(await status('A', '999999')).toBe('UNAVAILABLE');
    expect(await ServiceArea.countDocuments({ pinCode: '400001' })).toBe(0);
    const unknown = await ServiceArea.findOne({ status: 'UNKNOWN' }).lean();
    expect(unknown?.verifiedAt).toBeNull();
  });

  it('has products missing from one provider, and look-alike listings with no canonical product', async () => {
    const bListings = await ProviderListing.find({ providerId: ids.provider('B') }).lean();
    const bProducts = new Set(bListings.map((l) => String(l.canonicalProductId)));
    expect(bProducts.has(String(ids.product('bun-4')))).toBe(false);
    expect(bProducts.has(String(ids.product('atta-10')))).toBe(false);
    const unmatched = await ProviderListing.find({ matchStatus: 'UNMATCHED' }).lean();
    expect(unmatched).toHaveLength(3);
    expect(
      unmatched.every((l) => l.canonicalProductId === null && l.matchConfidence === null),
    ).toBe(true);
    expect(await ProviderListing.countDocuments({ matchStatus: 'LIKELY' })).toBe(1);
    expect(await ProviderListing.countDocuments({ matchStatus: 'SUBSTITUTE' })).toBe(1);
  });

  it('writes different titles for the same product per provider', async () => {
    const titles = await Promise.all(
      (['A', 'B', 'C'] as const).map(
        async (k) => (await ProviderListing.findById(ids.listing(k, 'milk-tt-500')).lean())?.title,
      ),
    );
    expect(titles).toEqual([
      'Meadow Fresh Toned Milk 500 ml',
      'Milk - Toned (Meadow Fresh) 500ml',
      'MEADOW FRESH MILK TONED 0.5 L',
    ]);
  });

  it('quote edge cases: VERIFIED once, STALE, null ETA, null fee vs zero fee, out of stock, discounts', async () => {
    expect(await Quote.countDocuments({ sourceStatus: 'VERIFIED' })).toBe(1);
    const stale = await Quote.findOne({ sourceStatus: 'STALE' }).lean();
    expect(stale!.expiresAt.getTime()).toBeLessThan(Date.now());

    const nullEta = await Quote.findOne({
      providerId: ids.provider('A'),
      pinCode: '110003',
    }).lean();
    expect(nullEta!.etaMinutes).toBeNull();

    const cNull = await Quote.findOne({ providerId: ids.provider('C'), pinCode: '110001' }).lean();
    expect(cNull!.platformFee).toBeNull();
    const cZero = await Quote.findOne({ providerId: ids.provider('C'), pinCode: '110002' }).lean();
    expect(cZero!.platformFee).toBe(0);

    const a = await Quote.findById(ids.quote('A', '110001', 'latest')).lean();
    const eggs = a!.items.find(
      (i) => String(i.canonicalProductId) === String(ids.product('eggs-6')),
    );
    expect(eggs).toMatchObject({ unitPrice: 48, inStock: false });
    expect(a!.discounts[0]).toMatchObject({ type: 'FLAT', value: 30, minOrderValue: 399 });
  });

  it('keeps an older snapshot so the latest one has to be chosen by retrievedAt', async () => {
    const snaps = await Quote.find({ providerId: ids.provider('A'), pinCode: '110001' })
      .sort({ retrievedAt: -1 })
      .lean();
    expect(snaps).toHaveLength(2);
    expect(snaps[0]!.deliveryFee).toBe(25);
  });

  it('creates the unique and lookup indexes', async () => {
    const idx = async (m: {
      collection: { indexes(): Promise<{ name?: string; unique?: boolean }[]> };
    }) => (await m.collection.indexes()).map((i) => i.name);
    expect(await idx(ServiceArea)).toContain('providerId_1_pinCode_1');
    expect(await idx(ProviderListing)).toContain('providerId_1_providerProductId_1');
    expect(await idx(Quote)).toContain('providerId_1_pinCode_1_retrievedAt_-1');
    expect((await idx(CanonicalProduct)).some((n) => n?.includes('text'))).toBe(true);
  });
});
