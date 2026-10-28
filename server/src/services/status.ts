import type { StatusInput, StatusResolution } from './engineTypes';

/**
 * Staleness is decided at response time, never stored:
 *  - now strictly after expiresAt                      -> STALE
 *  - optional: age greater than staleAfterMinutes      -> STALE
 *  - invalid dates                                     -> STALE (cannot be trusted)
 * It never upgrades: a stored STALE stays STALE; UNAVAILABLE stays UNAVAILABLE.
 * `isSample` remembers a SAMPLE origin even after a downgrade, so sample data is never shown as live.
 */
export function resolveStatus(
  quote: StatusInput,
  now: Date,
  opts: { staleAfterMinutes?: number } = {},
): StatusResolution {
  const stored = quote.sourceStatus;
  const base = { storedStatus: stored, isSample: stored === 'SAMPLE' };

  if (stored === 'UNAVAILABLE')
    return { ...base, status: 'UNAVAILABLE', isStale: false, downgraded: false };
  if (stored === 'STALE') return { ...base, status: 'STALE', isStale: true, downgraded: false };

  const nowMs = now.getTime();
  const retrievedMs = quote.retrievedAt.getTime();
  const expiresMs = quote.expiresAt.getTime();
  if (Number.isNaN(nowMs) || Number.isNaN(retrievedMs) || Number.isNaN(expiresMs)) {
    return {
      ...base,
      status: 'STALE',
      isStale: true,
      downgraded: true,
      reason: 'Invalid date on the quote, so it cannot be treated as current.',
    };
  }

  if (nowMs > expiresMs) {
    return {
      ...base,
      status: 'STALE',
      isStale: true,
      downgraded: true,
      reason: 'The quote has passed its expiry time.',
    };
  }
  const limit = opts.staleAfterMinutes;
  if (limit !== undefined && nowMs - retrievedMs > limit * 60_000) {
    return {
      ...base,
      status: 'STALE',
      isStale: true,
      downgraded: true,
      reason: `The quote is older than ${limit} minutes.`,
    };
  }
  return { ...base, status: stored, isStale: false, downgraded: false };
}
