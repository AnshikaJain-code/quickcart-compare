/**
 * Provider adapter contract (CLAUDE.md "Adapter interface").
 * The compare service only ever talks to providers through this interface, so a real, authorised
 * integration can be added later without changing the comparison logic.
 */
import type { Serviceability, SourceStatus } from '../models/enums';
import type { BasketItem, DiscountInput, FeeSet, Offer } from '../services/engineTypes';

export interface Location {
  /** PIN code only. Precise GPS is never used or stored. */
  pinCode: string;
}

/** The provider fields adapters and the compare service need. */
export interface ProviderRef {
  id: string;
  name: string;
  slug: string;
  dataSourceType: string;
  officialBaseUrl: string | null;
  logoUrl: string | null;
}

export interface ServiceabilityResult {
  status: Serviceability;
  verifiedAt: Date | null;
  source: string;
}

/** A priced provider listing that maps to a canonical product, ready for computeCoverage. */
export interface AdapterOffer extends Offer {
  title: string;
  brand: string;
  packSize: string;
}

/** A provider's prices, fees and ETA for one PIN at one moment. */
export interface AdapterQuote {
  /** Id of the stored snapshot, or null if the source does not store snapshots. */
  quoteId: string | null;
  pinCode: string;
  /** Offers for the products in the requested basket only (all match statuses). */
  offers: AdapterOffer[];
  /** null / missing = unknown, 0 = confirmed zero. */
  fees: FeeSet;
  discounts: DiscountInput[];
  etaMinutes: number | null;
  sourceStatus: SourceStatus;
  retrievedAt: Date;
  expiresAt: Date;
  officialCheckoutUrl: string | null;
  /** Where the data came from, e.g. "seed". */
  source: string;
}

export interface ListingResult {
  listingId: string;
  title: string;
  brand: string;
  packSize: string;
  canonicalProductId: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  productUrl: string | null;
}

export interface ProviderAdapter {
  getServiceability(location: Location): Promise<ServiceabilityResult>;
  /** Resolves to null when the provider has no quote for this PIN (which is not the same as "not served"). */
  getQuote(location: Location, basket: BasketItem[]): Promise<AdapterQuote | null>;
  getProductListings(query: string, location: Location): Promise<ListingResult[]>;
}

/** Thrown by adapters that exist but have no credentials / agreement configured. */
export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfiguredError';
  }
}
