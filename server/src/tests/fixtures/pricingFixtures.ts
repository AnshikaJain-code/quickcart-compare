/**
 * Hand-calculated pricing cases. Every expected number has its arithmetic beside it.
 * Amounts are INR. Nothing here is computed by the code under test.
 */

/** Matched basket lines. Subtotal: 50*2 + 30*3 + 99.50*1 = 100 + 90 + 99.50 = 289.50 */
export const LINES = [
  { unitPrice: 50, quantity: 2 }, // 100.00
  { unitPrice: 30, quantity: 3 }, //  90.00
  { unitPrice: 99.5, quantity: 1 }, //  99.50
];
export const SUBTOTAL = 289.5;

export const ALL_ZERO_FEES = {
  deliveryFee: 0,
  platformFee: 0,
  smallOrderFee: 0,
  otherFees: 0,
  taxes: 0,
};

export const totalCases = {
  // 289.50 + 0 + 0 + 0 + 0 + 0 = 289.50 (confirmed zero fees are real zeros)
  zeroFees: { fees: ALL_ZERO_FEES, discounts: [], expectedTotal: 289.5 },

  // fees = 25 + 3 + 0 + 5 + 2.50 = 35.50 ; 289.50 + 35.50 = 325.00
  nonZeroFees: {
    fees: { deliveryFee: 25, platformFee: 3, smallOrderFee: 0, otherFees: 5, taxes: 2.5 },
    discounts: [],
    expectedTotal: 325,
    expectedFeesTotal: 35.5,
  },

  // same fees, FLAT 30 off with minimum 250 (289.50 >= 250, met): 289.50 + 35.50 - 30 = 295.00
  withFlatDiscount: {
    fees: { deliveryFee: 25, platformFee: 3, smallOrderFee: 0, otherFees: 5, taxes: 2.5 },
    discounts: [
      {
        code: 'F30',
        label: 'Rs 30 off',
        type: 'FLAT' as const,
        value: 30,
        minOrderValue: 250,
        maxDiscount: null,
      },
    ],
    expectedTotal: 295,
  },

  // same fees, FLAT 30 off with minimum 399 (289.50 < 399, NOT met): 289.50 + 35.50 = 325.00
  discountNotMet: {
    fees: { deliveryFee: 25, platformFee: 3, smallOrderFee: 0, otherFees: 5, taxes: 2.5 },
    discounts: [
      {
        code: 'F30',
        label: 'Rs 30 off',
        type: 'FLAT' as const,
        value: 30,
        minOrderValue: 399,
        maxDiscount: null,
      },
    ],
    expectedTotal: 325,
  },

  // platformFee unknown (null): total must be null, never 0 or a partial sum
  oneNullFee: {
    fees: { deliveryFee: 25, platformFee: null, smallOrderFee: 0, otherFees: 0, taxes: 0 },
    discounts: [],
    expectedUnknown: ['platformFee'],
  },

  // delivery and taxes unknown
  twoNullFees: {
    fees: { deliveryFee: null, platformFee: 3, smallOrderFee: 0, otherFees: 0, taxes: null },
    discounts: [],
    expectedUnknown: ['deliveryFee', 'taxes'],
  },

  // only deliveryFee is required; others null are left out of the sum (and reported):
  // 289.50 + 25 = 314.50
  relaxedRequired: {
    fees: { deliveryFee: 25, platformFee: null, smallOrderFee: null, otherFees: null, taxes: null },
    requiredFees: ['deliveryFee'] as const,
    expectedTotal: 314.5,
  },
};

export const discountCases = {
  // 10% of 289.50 = 28.95
  percentOnly: {
    type: 'PERCENT' as const,
    value: 10,
    minOrderValue: null,
    maxDiscount: null,
    expected: 28.95,
  },
  // 10% = 28.95 but capped at 20 -> 20.00
  percentCapped: {
    type: 'PERCENT' as const,
    value: 10,
    minOrderValue: null,
    maxDiscount: 20,
    expected: 20,
  },
  // 10% off with minimum 300: 289.50 < 300 -> not applied
  percentBelowMin: {
    type: 'PERCENT' as const,
    value: 10,
    minOrderValue: 300,
    maxDiscount: 40,
    expected: 0,
  },
  // minimum exactly equals the subtotal (289.50 >= 289.50) -> applied
  flatAtBoundary: {
    type: 'FLAT' as const,
    value: 30,
    minOrderValue: 289.5,
    maxDiscount: null,
    expected: 30,
  },
  // 99.99 * 10% = 9.999 -> rounds to 10.00 (to the nearest paisa)
  percentRounding: { subtotal: 99.99, type: 'PERCENT' as const, value: 10, expected: 10 },
  // two eligible discounts stack: 30 + 28.95 = 58.95
  stacked: { total: 58.95 },
  // FLAT 500 on a 289.50 basket is capped at the subtotal: discount 289.50, so total = fees only
  cappedAtSubtotal: { type: 'FLAT' as const, value: 500, expected: 289.5 },
  // float trap: 0.10 + 0.20 must be exactly 0.30
  floatTrap: {
    lines: [
      { unitPrice: 0.1, quantity: 1 },
      { unitPrice: 0.2, quantity: 1 },
    ],
    expectedSubtotal: 0.3,
  },
};

/** Basket coverage fixture. 4 requested lines. */
export const BASKET = [
  { productId: 'p1', quantity: 2 },
  { productId: 'p2', quantity: 1 },
  { productId: 'p3', quantity: 1 },
  { productId: 'p4', quantity: 3 },
];
