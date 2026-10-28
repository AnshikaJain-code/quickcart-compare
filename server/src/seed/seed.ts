import type { Types } from 'mongoose';
import {
  AdminAuditLog,
  AdminUser,
  CanonicalProduct,
  Provider,
  ProviderListing,
  Quote,
  ServiceArea,
} from '../models';
import { CHECKOUT_URLS, COVERAGE, PRODUCTS, PROVIDERS, QUOTES, type ProviderKey } from './data';
import { ids, stableId } from './ids';
import { buildListingSpecs } from './listings';

export { ids, stableId };

export interface SeedSummary {
  providers: number;
  serviceAreas: number;
  products: number;
  listings: number;
  quotes: number;
}

/**
 * Clears and reloads ALL sample collections. Safe to run repeatedly.
 * Admin users and audit logs are NOT touched (they are real data, not sample data).
 * Uses the raw collection for deletes because Quotes are append-only through Mongoose.
 */
export async function seedDatabase(now: Date = new Date()): Promise<SeedSummary> {
  const sampleModels = [Provider, ServiceArea, CanonicalProduct, ProviderListing, Quote] as const;

  for (const m of sampleModels) await m.collection.deleteMany({});
  await Promise.all([...sampleModels, AdminUser, AdminAuditLog].map((m) => m.syncIndexes()));

  const minutes = (n: number) => new Date(now.getTime() - n * 60_000);

  await Provider.insertMany(
    PROVIDERS.map((p) => ({
      _id: ids.provider(p.key),
      name: p.name,
      slug: p.slug,
      officialBaseUrl: p.officialBaseUrl,
      logoUrl: null,
      active: true,
      dataSourceType: 'SEED',
    })),
  );

  await ServiceArea.insertMany(
    COVERAGE.map((c) => ({
      providerId: ids.provider(c.provider),
      pinCode: c.pinCode,
      status: c.status,
      verifiedAt: c.status === 'UNKNOWN' ? null : now,
      source: 'seed',
    })),
  );

  await CanonicalProduct.insertMany(
    PRODUCTS.map((p) => ({
      _id: ids.product(p.key),
      name: p.name,
      brand: p.brand,
      category: p.category,
      variant: p.variant,
      quantityValue: p.qty,
      quantityUnit: p.unit,
      identifiers: { gtin: p.gtin ?? null, sku: null },
      imageUrl: null,
    })),
  );

  // Listings, plus the provider price sheets used for the quote items.
  const sheets: Record<
    ProviderKey,
    { listingId: Types.ObjectId; productKey: string | null; price: number }[]
  > = {
    A: [],
    B: [],
    C: [],
  };
  const specs = buildListingSpecs();
  await ProviderListing.insertMany(
    specs.map((s) => {
      const listingId = ids.listing(s.provider, s.listingKey);
      sheets[s.provider].push({ listingId, productKey: s.canonicalKey, price: s.price });
      return {
        _id: listingId,
        providerId: ids.provider(s.provider),
        providerProductId: s.providerProductId,
        title: s.title,
        brand: s.brand,
        packSize: s.packSize,
        canonicalProductId: s.canonicalKey ? ids.product(s.canonicalKey) : null,
        matchStatus: s.matchStatus,
        matchConfidence: s.matchConfidence,
        productUrl: null,
        source: 'seed',
      };
    }),
  );

  await Quote.insertMany(
    QUOTES.map((q) => ({
      _id: ids.quote(q.provider, q.pinCode, q.tag),
      providerId: ids.provider(q.provider),
      pinCode: q.pinCode,
      items: sheets[q.provider].map((s) => ({
        listingId: s.listingId,
        canonicalProductId: s.productKey ? ids.product(s.productKey) : null,
        unitPrice: s.price,
        inStock: !(s.productKey && q.outOfStock.includes(s.productKey)),
      })),
      currency: 'INR',
      deliveryFee: q.deliveryFee,
      platformFee: q.platformFee,
      smallOrderFee: q.smallOrderFee,
      otherFees: q.otherFees,
      taxes: q.taxes,
      discounts: q.discounts,
      etaMinutes: q.etaMinutes,
      estimatedTotal: null,
      sourceStatus: q.sourceStatus,
      retrievedAt: minutes(q.ageMinutes),
      expiresAt: minutes(q.ageMinutes - q.ttlMinutes),
      officialCheckoutUrl: CHECKOUT_URLS[q.provider],
      source: 'seed',
    })),
  );

  const counts = await Promise.all([
    Provider.countDocuments(),
    ServiceArea.countDocuments(),
    CanonicalProduct.countDocuments(),
    ProviderListing.countDocuments(),
    Quote.countDocuments(),
  ]);
  const [providers, serviceAreas, products, listings, quotes] = counts as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { providers, serviceAreas, products, listings, quotes };
}
