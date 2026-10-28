import { ProviderListing, Quote, ServiceArea } from '../models';
import type { BasketItem } from '../services/engineTypes';
import type {
  AdapterOffer,
  AdapterQuote,
  ListingResult,
  Location,
  ProviderAdapter,
  ProviderRef,
  ServiceabilityResult,
} from './types';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads everything from MongoDB: the service area, the LATEST quote snapshot for the PIN, and the
 * provider listings. Prices and stock come from the quote; the product mapping and match status
 * come from the listing, so an admin re-mapping takes effect without a new quote.
 * This is the only adapter the project ships. All its data is sample data.
 */
export class SeededDbAdapter implements ProviderAdapter {
  constructor(private readonly provider: ProviderRef) {}

  async getServiceability(location: Location): Promise<ServiceabilityResult> {
    const area = await ServiceArea.findOne({
      providerId: this.provider.id,
      pinCode: location.pinCode,
    }).lean();
    // No row means we have no data, which is UNKNOWN, never "not served".
    if (!area) return { status: 'UNKNOWN', verifiedAt: null, source: 'seed' };
    return { status: area.status, verifiedAt: area.verifiedAt ?? null, source: area.source };
  }

  async getQuote(location: Location, basket: BasketItem[]): Promise<AdapterQuote | null> {
    const quote = await Quote.findOne({ providerId: this.provider.id, pinCode: location.pinCode })
      .sort({ retrievedAt: -1, _id: -1 })
      .lean();
    if (!quote) return null;

    const wanted = [...new Set(basket.map((b) => b.productId))];
    const listings = await ProviderListing.find({
      _id: { $in: quote.items.map((i) => i.listingId) },
      canonicalProductId: { $in: wanted },
    }).lean();
    const byId = new Map(listings.map((l) => [String(l._id), l]));

    const offers: AdapterOffer[] = [];
    for (const item of quote.items) {
      const listing = byId.get(String(item.listingId));
      if (!listing) continue;
      offers.push({
        listingId: String(item.listingId),
        canonicalProductId: listing.canonicalProductId ? String(listing.canonicalProductId) : null,
        unitPrice: item.unitPrice,
        inStock: item.inStock,
        matchStatus: listing.matchStatus,
        title: listing.title,
        brand: listing.brand ?? '',
        packSize: listing.packSize,
      });
    }

    return {
      quoteId: String(quote._id),
      pinCode: quote.pinCode,
      offers,
      fees: {
        deliveryFee: quote.deliveryFee ?? null,
        platformFee: quote.platformFee ?? null,
        smallOrderFee: quote.smallOrderFee ?? null,
        otherFees: quote.otherFees ?? null,
        taxes: quote.taxes ?? null,
      },
      discounts: quote.discounts.map((d) => ({
        code: d.code ?? null,
        label: d.label,
        type: d.type,
        value: d.value,
        minOrderValue: d.minOrderValue ?? null,
        maxDiscount: d.maxDiscount ?? null,
      })),
      etaMinutes: quote.etaMinutes ?? null,
      sourceStatus: quote.sourceStatus,
      retrievedAt: quote.retrievedAt,
      expiresAt: quote.expiresAt,
      officialCheckoutUrl: quote.officialCheckoutUrl ?? null,
      source: quote.source,
    };
  }

  async getProductListings(query: string, _location: Location): Promise<ListingResult[]> {
    const q = query.trim().slice(0, 64);
    const filter = q
      ? { providerId: this.provider.id, title: new RegExp(escapeRegex(q), 'i') }
      : { providerId: this.provider.id };
    const rows = await ProviderListing.find(filter).sort({ title: 1 }).limit(50).lean();
    return rows.map((l) => ({
      listingId: String(l._id),
      title: l.title,
      brand: l.brand ?? '',
      packSize: l.packSize,
      canonicalProductId: l.canonicalProductId ? String(l.canonicalProductId) : null,
      matchStatus: l.matchStatus,
      matchConfidence: l.matchConfidence ?? null,
      productUrl: l.productUrl ?? null,
    }));
  }
}
