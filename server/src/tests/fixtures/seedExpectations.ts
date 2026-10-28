/**
 * Hand-calculated expectations for POST /compare on the SEEDED data (server/src/seed/data.ts).
 * Arithmetic is shown for every number. Nothing here is computed by the code under test.
 *
 * Seed unit prices [A, B, C] used below:
 *   milk-tt-500 27/28/26   milk-fc-500 33/34/(C is a SUBSTITUTE listing: 31)   bread-white-400 42/40/44
 *   rice-1 118/120/115     dal-1 168/165/172    eggs-6 48/50/47     bun-4 30/-/32
 *
 * Seed quote fees:
 *   A/110001 delivery 25, platform 3, small 0, other 0, taxes 0, ETA 12, FLAT 30 off min 399, eggs-6 OUT OF STOCK
 *   A/110002 delivery 20, platform 3, small 0, other 0, taxes 0, ETA 15, VERIFIED, no discounts
 *   A/110003 delivery 30, platform 3, small 0, other 0, taxes 0, ETA unknown
 *   B/110001 delivery 0, platform 10, small 20, other 0, taxes 0, ETA 20, 10% off (max 40) min 300
 *   B/110003 delivery 0, platform 10, small 20, other 0, taxes 0, ETA 25, STALE
 *   C/110001 delivery 35, platform UNKNOWN, small 0, other 0, taxes 0, ETA 9
 *   C/110002 delivery 30, platform 0, small 15, other 5, taxes 0, ETA 11, FLAT 20 off min 250, bread-white-400 OUT OF STOCK
 *   B/110002: no quote (coverage UNKNOWN).  C/110003: does not serve.  999999: nobody serves.
 */
import { ids } from '../../seed/ids';

export const pid = (key: string): string => ids.product(key).toHexString();
export const basket = (...lines: [string, number][]) =>
  lines.map(([key, quantity]) => ({ productId: pid(key), quantity }));

/** Basket 1: milk-tt-500 x2, bread-white-400 x1, rice-1 x1 */
export const BASKET_1 = basket(['milk-tt-500', 2], ['bread-white-400', 1], ['rice-1', 1]);
export const B1 = {
  // subtotal: A 27*2 + 42 + 118 = 54 + 42 + 118 = 214 ; B 28*2 + 40 + 120 = 56 + 40 + 120 = 216 ; C 26*2 + 44 + 115 = 52 + 44 + 115 = 211
  subtotal: { A: 214, B: 216, C: 211 },
  // A fees 25+3+0+0+0 = 28 ; 214 < 399 so no discount ; total 214 + 28 = 242
  // B fees 0+10+20+0+0 = 30 ; 216 < 300 so no discount ; total 216 + 30 = 246
  // C platform fee unknown -> total null
  total: { A: 242, B: 246, C: null },
  eta: { A: 12, B: 20, C: 9 },
};

/** Basket 2: milk-tt-500 x2, rice-1 x1, dal-1 x1 */
export const BASKET_2 = basket(['milk-tt-500', 2], ['rice-1', 1], ['dal-1', 1]);
export const B2 = {
  // subtotal: A 54 + 118 + 168 = 340 ; B 56 + 120 + 165 = 341 ; C 52 + 115 + 172 = 339
  subtotal: { A: 340, B: 341, C: 339 },
  at110002: {
    // A fees 20+3 = 23 ; no discounts ; total 340 + 23 = 363
    // C fees 30+0+15+5+0 = 50 ; FLAT 20 off applies (339 >= 250) ; total 339 + 50 - 20 = 369
    total: { A: 363, C: 369 },
    eta: { A: 15, C: 11 },
    // balance: price min 363 max 369 -> A 0, C 1 ; time min 11 max 15 -> A (15-11)/4 = 1, C 0
    //  0.2/0.8: A 0.2*0 + 0.8*1 = 0.8 ; C 0.2*1 + 0.8*0 = 0.2   -> C first
    //  0.8/0.2: A 0.8*0 + 0.2*1 = 0.2 ; C 0.8*1 + 0.2*0 = 0.8   -> A first
    //  0.5/0.5: A 0.5 ; C 0.5 (tie, shares rank 1; cheaper A listed first)
    balance: {
      '0.2/0.8': { A: 0.8, C: 0.2 },
      '0.8/0.2': { A: 0.2, C: 0.8 },
      '0.5/0.5': { A: 0.5, C: 0.5 },
    },
  },
  at110003: {
    // A fees 30+3 = 33 ; total 340 + 33 = 373 (ETA unknown)
    // B fees 0+10+20 = 30 ; total 341 + 30 = 371 (STALE quote, ETA 25)
    total: { A: 373, B: 371 },
  },
};

/** Basket P (partial): milk-tt-500 x1, bun-4 x1, rice-1 x1. bun-4 is not listed by B. */
export const BASKET_P = basket(['milk-tt-500', 1], ['bun-4', 1], ['rice-1', 1]);
export const BP = {
  // A: 27 + 30 + 118 = 175 ; fees 28 ; 175 < 399 no discount ; total 203
  // B (2 of 3 items): 28 + 120 = 148 ; fees 30 ; 148 < 300 no discount ; total 178 (NOT comparable with a full basket)
  // C: 26 + 32 + 115 = 173 ; platform fee unknown -> null
  A: { subtotal: 175, total: 203 },
  B: { subtotal: 148, total: 178, coverage: 2 / 3 },
  C: { subtotal: 173, total: null },
};

/** Basket O (out of stock): eggs-6 x1, milk-tt-500 x1. eggs-6 is out of stock at A/110001. */
export const BASKET_O = basket(['eggs-6', 1], ['milk-tt-500', 1]);
export const BO = {
  // A: eggs out of stock -> coverage 1/2
  // B: 50 + 28 = 78 ; fees 30 ; 78 < 300 no discount ; total 108
  // C: 47 + 26 = 73 ; platform unknown -> null
  B: { subtotal: 78, total: 108 },
  C: { subtotal: 73 },
};

/** Basket S (substitute): milk-fc-500 x1, rice-1 x1 at 110002. C only has a SUBSTITUTE for milk-fc-500. */
export const BASKET_S = basket(['milk-fc-500', 1], ['rice-1', 1]);
export const BS = {
  // A: 33 + 118 = 151 ; fees 23 ; total 174
  // C without opt-in: milk-fc-500 missing (SUBSTITUTE_NOT_ALLOWED) -> coverage 1/2
  // C with opt-in: 31 + 115 = 146 ; fees 50 ; FLAT 20 needs 250 (146 < 250) so not applied ; total 196
  A: { total: 174 },
  C: { subtotal: 146, total: 196 },
};
