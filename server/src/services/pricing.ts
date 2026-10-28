import { fromPaise, toPaise, assertMoney } from './money';
import { isUsableMatch } from './matching';
import {
  FEE_FIELDS,
  type AppliedDiscount,
  type BasketItem,
  type CompareMode,
  type CoverageLine,
  type CoverageResult,
  type DiscountInput,
  type DiscountResult,
  type EngineWarning,
  type FeeField,
  type FeeSet,
  type MissingItem,
  type MissingReason,
  type Offer,
  type PricedLine,
  type SkippedDiscount,
  type TotalResult,
} from './engineTypes';

export type { Offer } from './engineTypes';

const FEE_LABEL: Record<FeeField, string> = {
  deliveryFee: 'Delivery fee',
  platformFee: 'Platform fee',
  smallOrderFee: 'Small-order fee',
  otherFees: 'Other fees',
  taxes: 'Taxes',
};

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function mergeBasket(basket: BasketItem[]): BasketItem[] {
  if (basket.length === 0) throw new RangeError('basket must contain at least one item');
  const merged = new Map<string, number>();
  for (const item of basket) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new RangeError(
        `quantity for ${item.productId} must be a whole number of at least 1 (got ${String(item.quantity)})`,
      );
    }
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Deterministic pick: lowest price, then listingId. */
function cheapest(offers: Offer[]): Offer | undefined {
  return [...offers].sort(
    (a, b) => a.unitPrice - b.unitPrice || a.listingId.localeCompare(b.listingId),
  )[0];
}

/**
 * Coverage = available matched lines / requested lines.
 * An offer counts only if it is in stock and its match is usable: EXACT always,
 * SUBSTITUTE only with opt-in, LIKELY and UNMATCHED never (fuzzy matches are not auto-confirmed).
 */
export function computeCoverage(
  basket: BasketItem[],
  offers: Offer[],
  opts: { allowSubstitutes?: boolean } = {},
): CoverageResult {
  const allowSubstitutes = opts.allowSubstitutes === true;
  const wanted = mergeBasket(basket);
  for (const o of offers) assertMoney(o.unitPrice, `unitPrice of listing ${o.listingId}`);

  const lines: CoverageLine[] = [];
  const missing: MissingItem[] = [];

  for (const { productId, quantity } of wanted) {
    const forProduct = offers.filter((o) => o.canonicalProductId === productId);
    const usable = forProduct.filter((o) => isUsableMatch(o.matchStatus, allowSubstitutes));
    const inStock = usable.filter((o) => o.inStock);

    const exact = cheapest(inStock.filter((o) => o.matchStatus === 'EXACT'));
    const chosen = exact ?? cheapest(inStock.filter((o) => o.matchStatus === 'SUBSTITUTE'));

    if (chosen) {
      lines.push({
        productId,
        quantity,
        listingId: chosen.listingId,
        unitPrice: chosen.unitPrice,
        lineTotal: fromPaise(toPaise(chosen.unitPrice) * quantity),
        matchStatus: chosen.matchStatus,
        usedSubstitute: chosen.matchStatus === 'SUBSTITUTE',
      });
      continue;
    }

    let reason: MissingReason;
    if (usable.length > 0) reason = 'OUT_OF_STOCK';
    else if (forProduct.some((o) => o.matchStatus === 'SUBSTITUTE'))
      reason = 'SUBSTITUTE_NOT_ALLOWED';
    else if (forProduct.some((o) => o.matchStatus === 'LIKELY')) reason = 'UNCONFIRMED_MATCH';
    else reason = 'NOT_LISTED';
    missing.push({ productId, quantity, reason });
  }

  return {
    requestedCount: wanted.length,
    availableCount: lines.length,
    coverage: lines.length / wanted.length,
    isComplete: lines.length === wanted.length,
    lines,
    missing,
  };
}

/** Full-basket mode needs every line; partial mode needs at least one. */
export function isEligible(coverage: CoverageResult, mode: CompareMode): boolean {
  return mode === 'full-basket' ? coverage.coverage === 1 : coverage.availableCount > 0;
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

/**
 * Applies every discount whose conditions are met and adds them up (CLAUDE.md formula).
 * Minimum-order conditions are checked against the item subtotal (before fees and discounts).
 * The combined discount can never exceed the item subtotal.
 */
export function applyDiscounts(itemSubtotal: number, discounts: DiscountInput[]): DiscountResult {
  assertMoney(itemSubtotal, 'itemSubtotal');
  const subtotal = toPaise(itemSubtotal);
  const applied: AppliedDiscount[] = [];
  const skipped: SkippedDiscount[] = [];
  let totalPaise = 0;

  for (const d of discounts) {
    const code = d.code ?? null;
    const skip = (reason: SkippedDiscount['reason']) =>
      skipped.push({ code, label: d.label, reason });

    const validValue =
      Number.isFinite(d.value) && d.value > 0 && (d.type !== 'PERCENT' || d.value <= 100);
    if (!validValue) {
      skip('INVALID');
      continue;
    }
    if (subtotal <= 0) {
      skip('NO_ITEMS');
      continue;
    }
    if (d.minOrderValue != null && subtotal < toPaise(d.minOrderValue)) {
      skip('MIN_ORDER_NOT_MET');
      continue;
    }

    let amount = d.type === 'FLAT' ? toPaise(d.value) : Math.round((subtotal * d.value) / 100);
    if (d.type === 'PERCENT' && d.maxDiscount != null)
      amount = Math.min(amount, toPaise(d.maxDiscount));
    applied.push({ code, label: d.label, amount: fromPaise(amount) });
    totalPaise += amount;
  }

  return { applied, skipped, totalDiscount: fromPaise(Math.min(totalPaise, subtotal)) };
}

// ---------------------------------------------------------------------------
// Estimated total
// ---------------------------------------------------------------------------

export interface TotalInput {
  lines: PricedLine[];
  fees: FeeSet;
  discounts: DiscountInput[];
  /** Fees that must be known for a total to exist. Defaults to all five. */
  requiredFees?: readonly FeeField[];
}

/**
 * Total = sum(unitPrice x qty) + deliveryFee + platformFee + smallOrderFee + otherFees + taxes - eligibleDiscounts.
 * If any REQUIRED fee is unknown (null or missing) the total is null and totalIncomplete is true.
 * It is never reported as 0 or as a partial sum.
 */
export function computeEstimatedTotal(input: TotalInput): TotalResult {
  const required = new Set<FeeField>(input.requiredFees ?? FEE_FIELDS);
  const warnings: EngineWarning[] = [];

  let subtotalPaise = 0;
  for (const l of input.lines) {
    assertMoney(l.unitPrice, 'unitPrice');
    if (!Number.isInteger(l.quantity) || l.quantity < 1) {
      throw new RangeError(
        `quantity must be a whole number of at least 1 (got ${String(l.quantity)})`,
      );
    }
    subtotalPaise += toPaise(l.unitPrice) * l.quantity;
  }
  const itemSubtotal = fromPaise(subtotalPaise);

  const fees = {} as Record<FeeField, number | null>;
  const unknownFees: FeeField[] = [];
  let knownPaise = 0; // every known fee
  let requiredPaise = 0; // known fees that go into the total
  for (const f of FEE_FIELDS) {
    const v = input.fees[f];
    if (v === null || v === undefined) {
      fees[f] = null;
      if (required.has(f)) {
        unknownFees.push(f);
        warnings.push({
          code: 'FEE_UNKNOWN',
          field: f,
          message: `${FEE_LABEL[f]} is unknown, so the total cannot be calculated.`,
        });
      } else {
        warnings.push({
          code: 'FEE_OMITTED',
          field: f,
          message: `${FEE_LABEL[f]} is unknown and was left out of the total.`,
        });
      }
      continue;
    }
    assertMoney(v, FEE_LABEL[f]);
    fees[f] = v;
    knownPaise += toPaise(v);
    if (required.has(f)) requiredPaise += toPaise(v);
  }

  const disc = applyDiscounts(itemSubtotal, input.discounts);
  const hasItems = input.lines.length > 0;
  if (!hasItems)
    warnings.push({
      code: 'NO_ITEMS',
      message: 'No items are available from this provider, so there is no total.',
    });

  const totalIncomplete = unknownFees.length > 0;
  const estimatedTotal =
    !hasItems || totalIncomplete
      ? null
      : fromPaise(subtotalPaise + requiredPaise - toPaise(disc.totalDiscount));

  return {
    itemSubtotal,
    fees,
    knownFeesTotal: fromPaise(knownPaise),
    unknownFees,
    discountTotal: disc.totalDiscount,
    appliedDiscounts: disc.applied,
    skippedDiscounts: disc.skipped,
    estimatedTotal,
    totalIncomplete,
    warnings,
  };
}
