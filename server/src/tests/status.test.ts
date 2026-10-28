import { describe, expect, it } from 'vitest';
import { resolveStatus } from '../services/status';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

describe('resolveStatus', () => {
  it('keeps a fresh SAMPLE quote as SAMPLE', () => {
    expect(
      resolveStatus(
        {
          sourceStatus: 'SAMPLE',
          retrievedAt: at('2026-10-27T11:50:00Z'),
          expiresAt: at('2026-10-28T11:50:00Z'),
        },
        NOW,
      ),
    ).toMatchObject({
      status: 'SAMPLE',
      storedStatus: 'SAMPLE',
      isStale: false,
      isSample: true,
      downgraded: false,
    });
  });
  it('downgrades to STALE once now is past expiresAt, and remembers it was SAMPLE', () => {
    const r = resolveStatus(
      {
        sourceStatus: 'SAMPLE',
        retrievedAt: at('2026-10-25T12:00:00Z'),
        expiresAt: at('2026-10-27T11:59:59Z'),
      },
      NOW,
    );
    expect(r).toMatchObject({
      status: 'STALE',
      storedStatus: 'SAMPLE',
      isStale: true,
      isSample: true,
      downgraded: true,
    });
  });
  it('now exactly equal to expiresAt is NOT stale (strictly after)', () => {
    expect(
      resolveStatus(
        { sourceStatus: 'SAMPLE', retrievedAt: at('2026-10-26T12:00:00Z'), expiresAt: NOW },
        NOW,
      ).status,
    ).toBe('SAMPLE');
  });
  it('downgrades VERIFIED and LIVE too: they cannot be presented as current once expired', () => {
    for (const s of ['VERIFIED', 'LIVE', 'ESTIMATED'] as const) {
      const r = resolveStatus(
        {
          sourceStatus: s,
          retrievedAt: at('2026-10-20T12:00:00Z'),
          expiresAt: at('2026-10-21T12:00:00Z'),
        },
        NOW,
      );
      expect(r.status).toBe('STALE');
      expect(r.storedStatus).toBe(s);
      expect(r.isSample).toBe(false);
    }
  });
  it('a stored STALE is never upgraded, even if the dates look fresh', () => {
    const r = resolveStatus(
      {
        sourceStatus: 'STALE',
        retrievedAt: at('2026-10-27T11:00:00Z'),
        expiresAt: at('2026-10-28T11:00:00Z'),
      },
      NOW,
    );
    expect(r).toMatchObject({ status: 'STALE', isStale: true, downgraded: false });
  });
  it('UNAVAILABLE stays UNAVAILABLE even when expired', () => {
    expect(
      resolveStatus(
        {
          sourceStatus: 'UNAVAILABLE',
          retrievedAt: at('2026-10-01T00:00:00Z'),
          expiresAt: at('2026-10-02T00:00:00Z'),
        },
        NOW,
      ).status,
    ).toBe('UNAVAILABLE');
  });
  it('an optional age threshold can mark a quote stale before it expires', () => {
    const q = {
      sourceStatus: 'SAMPLE' as const,
      retrievedAt: at('2026-10-27T10:00:00Z'),
      expiresAt: at('2026-10-28T10:00:00Z'),
    };
    // age is exactly 120 minutes
    expect(resolveStatus(q, NOW, { staleAfterMinutes: 90 }).status).toBe('STALE');
    expect(resolveStatus(q, NOW, { staleAfterMinutes: 120 }).status).toBe('SAMPLE'); // boundary: not older than
    expect(resolveStatus(q, NOW, { staleAfterMinutes: 180 }).status).toBe('SAMPLE');
    expect(resolveStatus(q, NOW).status).toBe('SAMPLE');
  });
  it('invalid dates cannot be trusted: STALE with a reason', () => {
    const r = resolveStatus(
      {
        sourceStatus: 'SAMPLE',
        retrievedAt: new Date('nope'),
        expiresAt: at('2026-10-28T00:00:00Z'),
      },
      NOW,
    );
    expect(r.status).toBe('STALE');
    expect(r.reason).toMatch(/date/i);
  });
  it('does not mutate its input', () => {
    const q = {
      sourceStatus: 'SAMPLE' as const,
      retrievedAt: at('2026-10-25T12:00:00Z'),
      expiresAt: at('2026-10-26T12:00:00Z'),
    };
    const snap = JSON.stringify(q);
    resolveStatus(q, NOW);
    expect(JSON.stringify(q)).toBe(snap);
  });
});
