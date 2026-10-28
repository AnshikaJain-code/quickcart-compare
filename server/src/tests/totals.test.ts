import { describe, expect, it } from 'vitest';
import { applyDiscounts, computeEstimatedTotal } from '../services/pricing';
import {
  ALL_ZERO_FEES,
  discountCases as D,
  LINES,
  SUBTOTAL,
  totalCases as T,
} from './fixtures/pricingFixtures';

const d = (
  o: Partial<{
    type: 'FLAT' | 'PERCENT';
    value: number;
    minOrderValue: number | null;
    maxDiscount: number | null;
    label: string;
    code: string | null;
  }>,
) => ({
  code: null,
  label: 'test',
  type: 'FLAT' as const,
  value: 10,
  minOrderValue: null,
  maxDiscount: null,
  ...o,
});

describe('applyDiscounts', () => {
  it('PERCENT: 10% of 289.50 is 28.95', () => {
    expect(applyDiscounts(SUBTOTAL, [d(D.percentOnly)]).totalDiscount).toBe(D.percentOnly.expected);
  });
  it('PERCENT with a cap: 28.95 is capped at 20', () => {
    expect(applyDiscounts(SUBTOTAL, [d(D.percentCapped)]).totalDiscount).toBe(20);
  });
  it('minimum order not met: nothing applied, and the reason is given', () => {
    const r = applyDiscounts(SUBTOTAL, [d(D.percentBelowMin)]);
    expect(r.totalDiscount).toBe(0);
    expect(r.applied).toEqual([]);
    expect(r.skipped).toEqual([expect.objectContaining({ reason: 'MIN_ORDER_NOT_MET' })]);
  });
  it('minimum order exactly equal to the subtotal counts as met', () => {
    expect(applyDiscounts(SUBTOTAL, [d(D.flatAtBoundary)]).totalDiscount).toBe(30);
  });
  it('a paisa short of the minimum is not met', () => {
    expect(applyDiscounts(289.49, [d({ value: 30, minOrderValue: 289.5 })]).totalDiscount).toBe(0);
  });
  it('rounds percentages to the nearest paisa: 10% of 99.99 = 9.999 -> 10.00', () => {
    expect(
      applyDiscounts(D.percentRounding.subtotal, [d({ type: 'PERCENT', value: 10 })]).totalDiscount,
    ).toBe(10);
  });
  it('eligible discounts add up: 30 + 28.95 = 58.95', () => {
    const r = applyDiscounts(SUBTOTAL, [d({ value: 30 }), d({ type: 'PERCENT', value: 10 })]);
    expect(r.totalDiscount).toBe(D.stacked.total);
    expect(r.applied).toHaveLength(2);
  });
  it('the total discount never exceeds the item subtotal', () => {
    expect(applyDiscounts(SUBTOTAL, [d({ value: 500 })]).totalDiscount).toBe(
      D.cappedAtSubtotal.expected,
    );
  });
  it('ignores invalid discounts (zero/negative/over 100%) rather than guessing', () => {
    const r = applyDiscounts(SUBTOTAL, [
      d({ value: 0 }),
      d({ value: -5 }),
      d({ type: 'PERCENT', value: 150 }),
    ]);
    expect(r.totalDiscount).toBe(0);
    expect(r.skipped.every((s) => s.reason === 'INVALID')).toBe(true);
  });
  it('nothing applies to an empty basket', () => {
    expect(applyDiscounts(0, [d({ value: 30 })]).totalDiscount).toBe(0);
  });
  it('does not mutate its inputs', () => {
    const list = [d({ value: 30 })];
    const snap = JSON.stringify(list);
    applyDiscounts(SUBTOTAL, list);
    expect(JSON.stringify(list)).toBe(snap);
  });
});

describe('computeEstimatedTotal', () => {
  it('sums lines exactly: 100 + 90 + 99.50 = 289.50', () => {
    expect(
      computeEstimatedTotal({ lines: LINES, fees: ALL_ZERO_FEES, discounts: [] }).itemSubtotal,
    ).toBe(SUBTOTAL);
  });
  it('has no float drift (0.10 + 0.20 = 0.30)', () => {
    expect(
      computeEstimatedTotal({ lines: D.floatTrap.lines, fees: ALL_ZERO_FEES, discounts: [] })
        .itemSubtotal,
    ).toBe(0.3);
  });
  it('confirmed zero fees are real zeros: total 289.50, complete', () => {
    const r = computeEstimatedTotal({ lines: LINES, fees: T.zeroFees.fees, discounts: [] });
    expect(r).toMatchObject({
      estimatedTotal: T.zeroFees.expectedTotal,
      totalIncomplete: false,
      unknownFees: [],
      warnings: [],
    });
  });
  it('non-zero fees: 289.50 + 35.50 = 325.00', () => {
    const r = computeEstimatedTotal({ lines: LINES, fees: T.nonZeroFees.fees, discounts: [] });
    expect(r).toMatchObject({ estimatedTotal: 325, knownFeesTotal: 35.5, totalIncomplete: false });
  });
  it('applies an eligible discount: 289.50 + 35.50 - 30 = 295.00', () => {
    const r = computeEstimatedTotal({
      lines: LINES,
      fees: T.withFlatDiscount.fees,
      discounts: T.withFlatDiscount.discounts,
    });
    expect(r).toMatchObject({ estimatedTotal: 295, discountTotal: 30 });
  });
  it('does not apply a discount whose condition is not met: 325.00', () => {
    const r = computeEstimatedTotal({
      lines: LINES,
      fees: T.discountNotMet.fees,
      discounts: T.discountNotMet.discounts,
    });
    expect(r).toMatchObject({ estimatedTotal: 325, discountTotal: 0 });
    expect(r.skippedDiscounts).toHaveLength(1);
  });

  it('a null fee gives estimatedTotal null (never 0) with totalIncomplete true and a warning', () => {
    const r = computeEstimatedTotal({ lines: LINES, fees: T.oneNullFee.fees, discounts: [] });
    expect(r.estimatedTotal).toBeNull();
    expect(r.estimatedTotal).not.toBe(0);
    expect(r.totalIncomplete).toBe(true);
    expect(r.unknownFees).toEqual(T.oneNullFee.expectedUnknown);
    expect(r.warnings).toEqual([
      expect.objectContaining({ code: 'FEE_UNKNOWN', field: 'platformFee' }),
    ]);
    // the pieces we do know are still reported
    expect(r.itemSubtotal).toBe(SUBTOTAL);
    expect(r.knownFeesTotal).toBe(25);
  });
  it('lists every unknown fee, one warning each', () => {
    const r = computeEstimatedTotal({ lines: LINES, fees: T.twoNullFees.fees, discounts: [] });
    expect(r.estimatedTotal).toBeNull();
    expect(r.unknownFees).toEqual(T.twoNullFees.expectedUnknown);
    expect(r.warnings.map((w) => w.field)).toEqual(['deliveryFee', 'taxes']);
  });
  it('a missing (undefined) fee is unknown too, never zero', () => {
    const r = computeEstimatedTotal({ lines: LINES, fees: { deliveryFee: 10 }, discounts: [] });
    expect(r.estimatedTotal).toBeNull();
    expect(r.unknownFees).toEqual(['platformFee', 'smallOrderFee', 'otherFees', 'taxes']);
  });
  it('requiredFees can be relaxed; omitted fees are reported, not treated as zero: 289.50 + 25 = 314.50', () => {
    const r = computeEstimatedTotal({
      lines: LINES,
      fees: T.relaxedRequired.fees,
      discounts: [],
      requiredFees: [...T.relaxedRequired.requiredFees],
    });
    expect(r.estimatedTotal).toBe(T.relaxedRequired.expectedTotal);
    expect(r.totalIncomplete).toBe(false);
    expect(r.warnings.map((w) => w.code)).toEqual([
      'FEE_OMITTED',
      'FEE_OMITTED',
      'FEE_OMITTED',
      'FEE_OMITTED',
    ]); // 4 optional fees are null
  });
  it('a discount cannot push the total below the fees: FLAT 500 -> 289.50 + 35.50 - 289.50 = 35.50', () => {
    const r = computeEstimatedTotal({
      lines: LINES,
      fees: T.nonZeroFees.fees,
      discounts: [d({ value: 500 })],
    });
    expect(r.estimatedTotal).toBe(35.5);
  });
  it('an empty line list has no total (null), with a NO_ITEMS warning', () => {
    const r = computeEstimatedTotal({ lines: [], fees: ALL_ZERO_FEES, discounts: [] });
    expect(r.estimatedTotal).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain('NO_ITEMS');
  });
  it('rejects invalid line data', () => {
    expect(() =>
      computeEstimatedTotal({
        lines: [{ unitPrice: -1, quantity: 1 }],
        fees: ALL_ZERO_FEES,
        discounts: [],
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeEstimatedTotal({
        lines: [{ unitPrice: 1, quantity: 0 }],
        fees: ALL_ZERO_FEES,
        discounts: [],
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeEstimatedTotal({
        lines: LINES,
        fees: { ...ALL_ZERO_FEES, deliveryFee: -5 },
        discounts: [],
      }),
    ).toThrow(RangeError);
  });
});
