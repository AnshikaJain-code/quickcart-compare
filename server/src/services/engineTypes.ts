/**
 * Types shared by the comparison engine and (from Phase 3) the API.
 * Everything in the engine is a pure function over these plain objects.
 */
import type { MatchStatus, SourceStatus } from '../models/enums';

export type CompareMode = 'full-basket' | 'partial';

// ---- warnings --------------------------------------------------------------

export type WarningCode =
  | 'FEE_UNKNOWN'
  | 'FEE_OMITTED'
  | 'NO_ITEMS'
  | 'TOTAL_UNKNOWN'
  | 'ETA_UNKNOWN'
  | 'ETA_STALE'
  | 'NO_ELIGIBLE_PROVIDERS'
  // raised by the compare service (Phase 3)
  | 'DEMO_DATA'
  | 'PIN_UNSUPPORTED'
  | 'PIN_UNKNOWN'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'NO_QUOTE'
  | 'STALE_QUOTE'
  | 'TOTAL_INCOMPLETE'
  | 'MISSING_ITEMS'
  | 'SUBSTITUTE_USED'
  | 'PARTIAL_BASKET';

export interface EngineWarning {
  code: WarningCode;
  message: string;
  providerId?: string;
  field?: string;
}

// ---- basket and coverage ---------------------------------------------------

export interface BasketItem {
  productId: string;
  quantity: number;
}

/** One provider listing's price for one canonical product, joined with its match status. */
export interface Offer {
  listingId: string;
  canonicalProductId: string | null;
  unitPrice: number;
  inStock: boolean;
  matchStatus: MatchStatus;
}

export type MissingReason =
  'NOT_LISTED' | 'OUT_OF_STOCK' | 'UNCONFIRMED_MATCH' | 'SUBSTITUTE_NOT_ALLOWED';

export interface MissingItem {
  productId: string;
  quantity: number;
  reason: MissingReason;
}

export interface CoverageLine {
  productId: string;
  quantity: number;
  listingId: string;
  unitPrice: number;
  lineTotal: number;
  matchStatus: MatchStatus;
  usedSubstitute: boolean;
}

export interface CoverageResult {
  requestedCount: number;
  availableCount: number;
  /** availableCount / requestedCount, between 0 and 1. */
  coverage: number;
  isComplete: boolean;
  lines: CoverageLine[];
  missing: MissingItem[];
}

// ---- fees, discounts, totals ----------------------------------------------

export const FEE_FIELDS = [
  'deliveryFee',
  'platformFee',
  'smallOrderFee',
  'otherFees',
  'taxes',
] as const;
export type FeeField = (typeof FEE_FIELDS)[number];
/** null (or missing) = unknown. 0 = confirmed zero. They are never interchangeable. */
export type FeeSet = Partial<Record<FeeField, number | null>>;

export interface DiscountInput {
  code?: string | null;
  label: string;
  type: 'FLAT' | 'PERCENT';
  value: number;
  minOrderValue?: number | null;
  maxDiscount?: number | null;
}

export interface AppliedDiscount {
  code: string | null;
  label: string;
  amount: number;
}

export type SkipReason = 'MIN_ORDER_NOT_MET' | 'INVALID' | 'NO_ITEMS';

export interface SkippedDiscount {
  code: string | null;
  label: string;
  reason: SkipReason;
}

export interface DiscountResult {
  applied: AppliedDiscount[];
  skipped: SkippedDiscount[];
  totalDiscount: number;
}

export interface PricedLine {
  unitPrice: number;
  quantity: number;
}

export interface TotalResult {
  itemSubtotal: number;
  fees: Record<FeeField, number | null>;
  /** Sum of the fees that ARE known. Not a total; shown only so the UI can list what is known. */
  knownFeesTotal: number;
  unknownFees: FeeField[];
  discountTotal: number;
  appliedDiscounts: AppliedDiscount[];
  skippedDiscounts: SkippedDiscount[];
  /** null whenever a required fee is unknown or there are no items. Never 0 in those cases. */
  estimatedTotal: number | null;
  totalIncomplete: boolean;
  warnings: EngineWarning[];
}

// ---- status ---------------------------------------------------------------

export interface StatusInput {
  sourceStatus: SourceStatus;
  retrievedAt: Date;
  expiresAt: Date;
}

export interface StatusResolution {
  status: SourceStatus;
  storedStatus: SourceStatus;
  isStale: boolean;
  /** True if the stored status was SAMPLE, even after a downgrade to STALE. */
  isSample: boolean;
  downgraded: boolean;
  reason?: string;
}

// ---- ranking ---------------------------------------------------------------

export interface Rankable {
  providerId: string;
  /** Display name, used only in warning messages. */
  name?: string;
  /** Passed the coverage rules for the chosen mode (see isEligible). */
  eligible: boolean;
  estimatedTotal: number | null;
  etaMinutes: number | null;
  status: SourceStatus;
}

export type ExcludeReason = 'NOT_ELIGIBLE' | 'NULL_TOTAL' | 'UNKNOWN_ETA' | 'STALE_ETA';

export type Ranked<T> = T & { rank: number };
export type RankedBalanced<T> = T & {
  rank: number;
  score: number;
  priceNorm: number;
  timeNorm: number;
};

export interface RankingResult<T, R = Ranked<T>> {
  ranked: R[];
  excluded: { item: T; reason: ExcludeReason }[];
  warnings: EngineWarning[];
}

export interface Weights {
  priceWeight: number;
  timeWeight: number;
}
