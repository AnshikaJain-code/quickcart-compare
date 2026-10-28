/** Shared enums and validators for all models (single source of truth). */

export const SOURCE_STATUSES = [
  'LIVE',
  'VERIFIED',
  'SAMPLE',
  'ESTIMATED',
  'STALE',
  'UNAVAILABLE',
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SERVICEABILITY = ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'] as const;
export type Serviceability = (typeof SERVICEABILITY)[number];

export const MATCH_STATUSES = ['EXACT', 'LIKELY', 'SUBSTITUTE', 'UNMATCHED'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const CATEGORIES = [
  'dairy',
  'bakery',
  'staples',
  'snacks',
  'beverages',
  'produce',
  'household',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const QUANTITY_UNITS = ['ml', 'l', 'g', 'kg', 'pcs'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const DATA_SOURCE_TYPES = ['SEED', 'MANUAL', 'AUTHORISED_API'] as const;
export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number];

export const ADMIN_ROLES = ['admin', 'reviewer'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const DISCOUNT_TYPES = ['FLAT', 'PERCENT'] as const;

/** Six digits, first digit 1-9 (Indian PIN codes never start with 0). */
export const PIN_CODE_REGEX = /^[1-9]\d{5}$/;

/** Outbound links must be https. Null means "no link". */
export function isHttpsUrlOrNull(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'string') return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Money is non-negative, finite and has at most two decimals. */
export function isMoneyOrNull(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.round(v * 100) / 100 === v;
}
