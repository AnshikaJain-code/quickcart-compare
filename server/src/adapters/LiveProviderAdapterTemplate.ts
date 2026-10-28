import type { BasketItem } from '../services/engineTypes';
import {
  NotConfiguredError,
  type AdapterQuote,
  type ListingResult,
  type Location,
  type ProviderAdapter,
  type ProviderRef,
  type ServiceabilityResult,
} from './types';

/**
 * TEMPLATE ONLY. No live integration exists in this project and none may be added without the
 * items below. Every method throws NotConfiguredError, which /compare reports as a warning for
 * that provider while the other providers still return normally.
 *
 * What an authorised integration requires before any code is written:
 *
 *  1. PERMISSION. A written agreement, partner API terms or an official public API that allows
 *     this use (price comparison). Terms, rate limits and attribution rules must be recorded in
 *     docs/decisions.md. Scraping, reverse-engineering apps, bypassing protections or logins, and
 *     collecting a provider's credentials are not allowed (CLAUDE.md rule 2).
 *  2. CREDENTIALS. API keys live in environment variables only (see PROVIDER_API_KEY in
 *     .env.example). Never in code, never in the client bundle, never in logs.
 *  3. MAPPING. Convert the provider's response into AdapterQuote:
 *       - prices, fees and discounts in INR; a fee the API does not state is null (unknown), not 0;
 *       - listings matched to canonical products with matchListing() and stored as LIKELY until an
 *         admin confirms them (fuzzy matches are never auto-confirmed);
 *       - sourceStatus LIVE only for data fetched just now from the authorised source, with
 *         retrievedAt and a short expiresAt so it turns STALE on its own.
 *  4. RESILIENCE. Respect the provider's rate limits, cache within the allowed terms, and fail fast.
 *     The compare service already applies a time limit and Promise.allSettled, but the adapter
 *     should still use its own HTTP timeouts and never retry in a tight loop.
 *  5. DATA POLICY. Only the PIN code is sent as location. No shopper identity or precise GPS.
 *  6. TESTS. Contract tests against recorded sample responses (not live calls in CI), covering
 *     timeouts, malformed bodies, and unknown fees.
 *
 * Register an implementation for a provider by setting its dataSourceType to AUTHORISED_API and
 * calling DefaultAdapterRegistry.setLiveFactory(...).
 */
export class LiveProviderAdapterTemplate implements ProviderAdapter {
  constructor(private readonly provider: ProviderRef) {}

  private notConfigured(method: string): NotConfiguredError {
    return new NotConfiguredError(
      `Live adapter for "${this.provider.name}" is not configured (${method}). No authorised integration exists.`,
    );
  }

  getServiceability(_location: Location): Promise<ServiceabilityResult> {
    return Promise.reject(this.notConfigured('getServiceability'));
  }

  getQuote(_location: Location, _basket: BasketItem[]): Promise<AdapterQuote | null> {
    return Promise.reject(this.notConfigured('getQuote'));
  }

  getProductListings(_query: string, _location: Location): Promise<ListingResult[]> {
    return Promise.reject(this.notConfigured('getProductListings'));
  }
}
