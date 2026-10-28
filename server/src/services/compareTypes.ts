/** Request and response shapes of POST /compare. Shared with the client in Phase 4. */
import type { Serviceability, SourceStatus } from '../models/enums';
import type {
  AppliedDiscount,
  CompareMode,
  EngineWarning,
  FeeField,
  MissingReason,
  SkippedDiscount,
  Weights,
} from './engineTypes';

export type SortBy = 'total' | 'eta' | 'balance';

export interface CompareRequest {
  pinCode: string;
  items: { productId: string; quantity: number }[];
  sortBy: SortBy;
  mode: CompareMode;
  /** The shopper opts in to different-brand substitutes. Default false. */
  allowSubstitutes: boolean;
  /** Only used when sortBy is 'balance'. */
  weights?: Weights;
}

export interface BasketLineInfo {
  productId: string;
  name: string;
  brand: string;
  packLabel: string;
  quantity: number;
}

export interface ResultLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  listingId: string;
  listingTitle: string;
  usedSubstitute: boolean;
}

export interface MissingLine {
  productId: string;
  name: string;
  quantity: number;
  reason: MissingReason;
}

export interface ProviderResult {
  providerId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  serviceability: Serviceability;
  serviceabilityVerifiedAt: string | null;
  /** Id of the stored quote snapshot: GET /quotes/:quoteId returns it in full. */
  quoteId: string | null;
  /** Status AFTER staleness is applied at response time. */
  status: SourceStatus;
  /** Status as stored on the quote. */
  storedStatus: SourceStatus;
  isStale: boolean;
  /** True for sample data, also when an expired sample quote now shows as STALE. */
  isSample: boolean;
  retrievedAt: string;
  expiresAt: string;
  /** null = unknown. Never 0 for unknown. */
  etaMinutes: number | null;
  /** When the ETA was observed (the quote's retrievedAt). */
  etaAsOf: string;
  itemSubtotal: number;
  /** Each fee is a number, or null when unknown. 0 means a confirmed zero. */
  fees: Record<FeeField, number | null>;
  unknownFees: FeeField[];
  knownFeesTotal: number;
  discountTotal: number;
  appliedDiscounts: AppliedDiscount[];
  skippedDiscounts: SkippedDiscount[];
  /** null when a fee is unknown or nothing is available. */
  estimatedTotal: number | null;
  totalIncomplete: boolean;
  coverage: number;
  availableCount: number;
  requestedCount: number;
  isComplete: boolean;
  lines: ResultLine[];
  missingItems: MissingLine[];
  /** A valid https link or null. Never an invented link. */
  officialLink: string | null;
}

export type RankedProviderResult = ProviderResult & {
  rank: number;
  /** Balance only. Lower is better. */
  score?: number;
  priceNorm?: number;
  timeNorm?: number;
};

export type UnrankedReason = 'NULL_TOTAL' | 'UNKNOWN_ETA' | 'STALE_ETA' | 'NO_ITEMS';

export type UnrankedProviderResult = ProviderResult & { unrankedReason: UnrankedReason };

export type UnavailableReason =
  'NOT_SERVING' | 'NO_QUOTE' | 'QUOTE_UNAVAILABLE' | 'TIMEOUT' | 'NOT_CONFIGURED' | 'ERROR';

export interface UnavailableProvider {
  providerId: string;
  name: string;
  slug: string;
  /** UNAVAILABLE (does not serve) and UNKNOWN (no data) are different states. */
  serviceability: Serviceability;
  reason: UnavailableReason;
  message: string;
}

export interface CompareResponse {
  pinCode: string;
  mode: CompareMode;
  sortBy: SortBy;
  /** The weights used when sortBy is 'balance', otherwise null. */
  weights: Weights | null;
  allowSubstitutes: boolean;
  generatedAt: string;
  /** True whenever any sample data is part of this response. The UI must show the Demo data banner. */
  isSampleData: boolean;
  basket: BasketLineInfo[];
  /** Ranked providers, best first. Ties share a rank. */
  results: RankedProviderResult[];
  /** Full-basket mode: providers missing items. They are not ranked. */
  partialResults: ProviderResult[];
  /** Complete baskets (or partial mode) that cannot be ranked for this sortBy, with the reason. */
  unrankedResults: UnrankedProviderResult[];
  /** Providers with no usable quote, with the reason. */
  unavailableProviders: UnavailableProvider[];
  warnings: EngineWarning[];
}
