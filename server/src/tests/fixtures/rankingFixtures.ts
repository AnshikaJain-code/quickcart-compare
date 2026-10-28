/**
 * Hand-calculated ranking cases. Arithmetic is shown beside each expectation.
 */
import type { SourceStatus } from '../../models/enums';

export interface Row {
  providerId: string;
  name?: string;
  eligible: boolean;
  estimatedTotal: number | null;
  etaMinutes: number | null;
  status: SourceStatus;
}

export const row = (o: Partial<Row> & { providerId: string }): Row => ({
  eligible: true,
  estimatedTotal: 100,
  etaMinutes: 20,
  status: 'SAMPLE',
  ...o,
});

/**
 * MIXED set:
 *  A  320.00  12 min  SAMPLE
 *  B  305.50  20 min  SAMPLE
 *  C  null     9 min  SAMPLE   (a fee is unknown, so no total)
 *  D  305.50  15 min  STALE    (ties with B on total)
 *  E  280.00  null    SAMPLE   not eligible (partial basket)
 *  F  290.00  null    SAMPLE   eligible but ETA unknown
 *
 * Cheapest: eligible with a total, ascending: F 290.00, then B and D tied at 305.50, then A 320.00.
 *   Tie B/D broken by faster known ETA: D (15) before B (20). Competition ranks: F=1, D=2, B=2, A=4.
 *   Excluded: C (total unknown), E (not eligible).
 * Fastest: eligible, known and NOT stale ETA, ascending: C 9, A 12, B 20.
 *   Excluded: D (STALE), E (not eligible), F (ETA unknown).
 */
export const MIXED: Row[] = [
  row({ providerId: 'A', estimatedTotal: 320, etaMinutes: 12 }),
  row({ providerId: 'B', estimatedTotal: 305.5, etaMinutes: 20 }),
  row({ providerId: 'C', estimatedTotal: null, etaMinutes: 9 }),
  row({ providerId: 'D', estimatedTotal: 305.5, etaMinutes: 15, status: 'STALE' }),
  row({ providerId: 'E', estimatedTotal: 280, etaMinutes: null, eligible: false }),
  row({ providerId: 'F', estimatedTotal: 290, etaMinutes: null }),
];

/**
 * BALANCED set (three providers):
 *  P 100.00 / 30 min,  Q 120.00 / 10 min,  R 108.00 / 18 min
 * Price: min 100, max 120, spread 20 -> priceNorm P=0, Q=1, R=(108-100)/20=0.4
 * Time:  min 10,  max 30,  spread 20 -> timeNorm  P=1, Q=0, R=(18-10)/20=0.4
 *
 * weights price/time -> score = wp*priceNorm + wt*timeNorm
 *  0.5/0.5: P=0.5*0+0.5*1=0.5  Q=0.5*1+0.5*0=0.5  R=0.5*0.4+0.5*0.4=0.4   order R, then P/Q tie
 *  0.8/0.2: P=0+0.2=0.2        Q=0.8+0=0.8        R=0.32+0.08=0.4         order P, R, Q
 *  0.2/0.8: P=0+0.8=0.8        Q=0.2+0=0.2        R=0.08+0.32=0.4         order Q, R, P
 *  1.0/0.0: P=0   Q=1   R=0.4                                             order P, R, Q
 *  0.0/1.0: P=1   Q=0   R=0.4                                             order Q, R, P
 */
export const BALANCED: Row[] = [
  row({ providerId: 'P', estimatedTotal: 100, etaMinutes: 30 }),
  row({ providerId: 'Q', estimatedTotal: 120, etaMinutes: 10 }),
  row({ providerId: 'R', estimatedTotal: 108, etaMinutes: 18 }),
];

export const BALANCED_EXPECTED = {
  norms: { P: { price: 0, time: 1 }, Q: { price: 1, time: 0 }, R: { price: 0.4, time: 0.4 } },
  scores: {
    '0.5/0.5': { P: 0.5, Q: 0.5, R: 0.4, order: ['R', 'P', 'Q'], ranks: { R: 1, P: 2, Q: 2 } },
    '0.8/0.2': { P: 0.2, Q: 0.8, R: 0.4, order: ['P', 'R', 'Q'] },
    '0.2/0.8': { P: 0.8, Q: 0.2, R: 0.4, order: ['Q', 'R', 'P'] },
    '1/0': { P: 0, Q: 1, R: 0.4, order: ['P', 'R', 'Q'] },
    '0/1': { P: 1, Q: 0, R: 0.4, order: ['Q', 'R', 'P'] },
  } as Record<
    string,
    { P: number; Q: number; R: number; order: string[]; ranks?: Record<string, number> }
  >,
};

/** All identical: spread is 0 for both price and time, so every norm and score is 0 (no NaN). */
export const ALL_EQUAL: Row[] = [
  row({ providerId: 'X', estimatedTotal: 150, etaMinutes: 20 }),
  row({ providerId: 'Y', estimatedTotal: 150, etaMinutes: 20 }),
  row({ providerId: 'Z', estimatedTotal: 150, etaMinutes: 20 }),
];

/** Same total, different ETAs: price spread 0 -> priceNorm 0 for all; time decides. */
export const SAME_PRICE: Row[] = [
  row({ providerId: 'S1', estimatedTotal: 200, etaMinutes: 30 }),
  row({ providerId: 'S2', estimatedTotal: 200, etaMinutes: 10 }),
  row({ providerId: 'S3', estimatedTotal: 200, etaMinutes: 20 }),
];
