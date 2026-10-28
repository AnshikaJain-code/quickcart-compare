/**
 * POST /compare: composes the Phase 2 pure functions with adapter calls.
 *
 * Per request: load active providers and the basket's products; ask every provider's adapter
 * (serviceability, then quote) in parallel under a time limit using Promise.allSettled; for each
 * quote compute coverage, totals and staleness; split full baskets from partial ones; rank by
 * sortBy; collect warnings. One provider failing or timing out never fails the comparison
 * (CLAUDE.md rule 5): it is reported under unavailableProviders with a warning.
 */
import { NotConfiguredError } from '../adapters/types';
import type {
  AdapterOffer,
  AdapterQuote,
  Location,
  ProviderRef,
  ServiceabilityResult,
} from '../adapters/types';
import type { AdapterRegistry } from '../adapters/registry';
import { isHttpsUrlOrNull, type Serviceability } from '../models/enums';
import { CanonicalProduct } from '../models/CanonicalProduct';
import { Provider } from '../models/Provider';
import { AppError } from '../middleware/errors';
import type {
  BasketLineInfo,
  CompareRequest,
  CompareResponse,
  MissingLine,
  ProviderResult,
  RankedProviderResult,
  ResultLine,
  UnavailableProvider,
  UnavailableReason,
  UnrankedProviderResult,
  UnrankedReason,
} from './compareTypes';
import {
  type BasketItem,
  type CoverageResult,
  type EngineWarning,
  type ExcludeReason,
  type FeeField,
  type Rankable,
  type StatusResolution,
  type Weights,
} from './engineTypes';
import { computeCoverage, computeEstimatedTotal, isEligible } from './pricing';
import { DEFAULT_WEIGHTS, rankBalanced, rankCheapest, rankFastest } from './ranking';
import { resolveStatus } from './status';
import { TimeoutError, withTimeout } from './timeout';

export interface CompareDeps {
  registry: AdapterRegistry;
  /** Injected clock so staleness is testable. */
  now: () => Date;
  adapterTimeoutMs: number;
  staleAfterMinutes?: number;
  /** Server-side log for unexpected adapter errors. Details never go to the client. */
  log?: (message: string, err: unknown) => void;
}

const FEE_LABEL: Record<FeeField, string> = {
  deliveryFee: 'delivery fee',
  platformFee: 'platform fee',
  smallOrderFee: 'small-order fee',
  otherFees: 'other fees',
  taxes: 'taxes',
};

type Outcome =
  | { kind: 'quote'; svc: ServiceabilityResult; quote: AdapterQuote }
  | { kind: 'not_serving'; svc: ServiceabilityResult }
  | { kind: 'no_quote'; svc: ServiceabilityResult };

interface Built {
  result: ProviderResult;
  coverage: CoverageResult;
  resolved: StatusResolution;
}

interface RankRow extends Rankable {
  built: Built;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const list = (names: string[]) => names.join(', ');

async function queryProvider(
  provider: ProviderRef,
  location: Location,
  basket: BasketItem[],
  registry: AdapterRegistry,
): Promise<Outcome> {
  const adapter = registry.adapterFor(provider);
  const svc = await adapter.getServiceability(location);
  // A provider that explicitly does not serve the PIN is not asked for a quote.
  if (svc.status === 'UNAVAILABLE') return { kind: 'not_serving', svc };
  // UNKNOWN is not "no": we still ask, because absence of data is not proof of absence.
  const quote = await adapter.getQuote(location, basket);
  return quote ? { kind: 'quote', svc, quote } : { kind: 'no_quote', svc };
}

function buildProviderResult(
  provider: ProviderRef,
  svc: ServiceabilityResult,
  quote: AdapterQuote,
  basket: BasketItem[],
  names: Map<string, string>,
  req: CompareRequest,
  deps: CompareDeps,
  now: Date,
): Built {
  const resolved = resolveStatus(
    {
      sourceStatus: quote.sourceStatus,
      retrievedAt: quote.retrievedAt,
      expiresAt: quote.expiresAt,
    },
    now,
    { staleAfterMinutes: deps.staleAfterMinutes },
  );
  const coverage = computeCoverage(basket, quote.offers, {
    allowSubstitutes: req.allowSubstitutes,
  });
  const total = computeEstimatedTotal({
    lines: coverage.lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
    fees: quote.fees,
    discounts: quote.discounts,
  });

  const offerById = new Map<string, AdapterOffer>(quote.offers.map((o) => [o.listingId, o]));
  const lines: ResultLine[] = coverage.lines.map((l) => ({
    productId: l.productId,
    name: names.get(l.productId) ?? l.productId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    listingId: l.listingId,
    listingTitle: offerById.get(l.listingId)?.title ?? '',
    usedSubstitute: l.usedSubstitute,
  }));
  const missingItems: MissingLine[] = coverage.missing.map((m) => ({
    productId: m.productId,
    name: names.get(m.productId) ?? m.productId,
    quantity: m.quantity,
    reason: m.reason,
  }));

  const checkout = quote.officialCheckoutUrl;
  const officialLink =
    checkout && isHttpsUrlOrNull(checkout)
      ? checkout
      : provider.officialBaseUrl && isHttpsUrlOrNull(provider.officialBaseUrl)
        ? provider.officialBaseUrl
        : null;

  const result: ProviderResult = {
    providerId: provider.id,
    name: provider.name,
    slug: provider.slug,
    logoUrl: provider.logoUrl,
    serviceability: svc.status,
    serviceabilityVerifiedAt: svc.verifiedAt ? svc.verifiedAt.toISOString() : null,
    quoteId: quote.quoteId,
    status: resolved.status,
    storedStatus: resolved.storedStatus,
    isStale: resolved.isStale,
    isSample: resolved.isSample,
    retrievedAt: quote.retrievedAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
    etaMinutes: quote.etaMinutes,
    etaAsOf: quote.retrievedAt.toISOString(),
    itemSubtotal: total.itemSubtotal,
    fees: total.fees,
    unknownFees: total.unknownFees,
    knownFeesTotal: total.knownFeesTotal,
    discountTotal: total.discountTotal,
    appliedDiscounts: total.appliedDiscounts,
    skippedDiscounts: total.skippedDiscounts,
    estimatedTotal: total.estimatedTotal,
    totalIncomplete: total.totalIncomplete,
    coverage: coverage.coverage,
    availableCount: coverage.availableCount,
    requestedCount: coverage.requestedCount,
    isComplete: coverage.isComplete,
    lines,
    missingItems,
    officialLink,
  };
  return { result, coverage, resolved };
}

function providerWarnings(b: Built, req: CompareRequest): EngineWarning[] {
  const r = b.result;
  const out: EngineWarning[] = [];
  if (r.isStale) {
    out.push({
      code: 'STALE_QUOTE',
      providerId: r.providerId,
      message: `${r.name}: prices are out of date (last retrieved ${r.retrievedAt}). Treat them as a guide only.`,
    });
  }
  if (r.totalIncomplete) {
    const fees = r.unknownFees.map((f) => FEE_LABEL[f]);
    out.push({
      code: 'TOTAL_INCOMPLETE',
      providerId: r.providerId,
      message: `${r.name}: the total cannot be calculated because the ${list(fees)} ${fees.length === 1 ? 'is' : 'are'} unknown.`,
    });
  }
  if (r.missingItems.length > 0) {
    out.push({
      code: 'MISSING_ITEMS',
      providerId: r.providerId,
      message: `${r.name}: ${r.missingItems.length} of ${r.requestedCount} items are not available (${list(r.missingItems.map((m) => m.name))}).`,
    });
  }
  const subs = r.lines.filter((l) => l.usedSubstitute);
  if (subs.length > 0) {
    out.push({
      code: 'SUBSTITUTE_USED',
      providerId: r.providerId,
      message: `${r.name}: includes a different-brand substitute for ${list(subs.map((l) => l.name))}.`,
    });
  }
  if (req.mode === 'partial' && !r.isComplete && r.availableCount > 0) {
    out.push({
      code: 'PARTIAL_BASKET',
      providerId: r.providerId,
      message: `${r.name}: this total covers only ${r.availableCount} of ${r.requestedCount} items, so it is not comparable with a full basket.`,
    });
  }
  return out;
}

const UNRANKED: Partial<Record<ExcludeReason, UnrankedReason>> = {
  NULL_TOTAL: 'NULL_TOTAL',
  UNKNOWN_ETA: 'UNKNOWN_ETA',
  STALE_ETA: 'STALE_ETA',
};

export async function compare(req: CompareRequest, deps: CompareDeps): Promise<CompareResponse> {
  const now = deps.now();
  const log = deps.log ?? ((m, e) => console.error(m, e));
  const basket: BasketItem[] = req.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
  }));
  const productIds = basket.map((b) => b.productId);

  const [providerDocs, productDocs] = await Promise.all([
    Provider.find({ active: true }).sort({ name: 1 }).lean(),
    CanonicalProduct.find({ _id: { $in: productIds } }).lean(),
  ]);

  const productById = new Map(productDocs.map((p) => [String(p._id), p]));
  const unknown = productIds.filter((id) => !productById.has(id));
  if (unknown.length > 0) {
    throw new AppError(
      400,
      'UNKNOWN_PRODUCTS',
      `${unknown.length} product id${unknown.length === 1 ? ' is' : 's are'} not in the catalogue`,
      unknown.map((productId) => ({ productId })),
    );
  }
  const names = new Map(
    productDocs.map((p) => [
      String(p._id),
      p.name + (p.variant ? ` ${p.variant}` : '') + ` ${p.packLabel}`,
    ]),
  );
  const basketInfo: BasketLineInfo[] = basket.map((b) => {
    const p = productById.get(b.productId)!;
    return {
      productId: b.productId,
      name: p.name,
      brand: p.brand,
      packLabel: p.packLabel,
      quantity: b.quantity,
    };
  });

  const providers: ProviderRef[] = providerDocs.map((p) => ({
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    dataSourceType: p.dataSourceType,
    officialBaseUrl: p.officialBaseUrl ?? null,
    logoUrl: p.logoUrl ?? null,
  }));

  const location: Location = { pinCode: req.pinCode };
  const settled = await Promise.allSettled(
    providers.map((p) =>
      withTimeout(
        () => queryProvider(p, location, basket, deps.registry),
        deps.adapterTimeoutMs,
        p.name,
      ),
    ),
  );

  const unavailable: UnavailableProvider[] = [];
  const built: Built[] = [];
  const perProviderWarnings = new Map<string, EngineWarning[]>();
  const serviceabilities: Serviceability[] = [];
  let failures = 0;
  const failureDetails: { provider: string; reason: UnavailableReason }[] = [];

  const addUnavailable = (
    p: ProviderRef,
    serviceability: Serviceability,
    reason: UnavailableReason,
    message: string,
    warning?: EngineWarning,
  ) => {
    unavailable.push({
      providerId: p.id,
      name: p.name,
      slug: p.slug,
      serviceability,
      reason,
      message,
    });
    if (warning) perProviderWarnings.set(p.id, [...(perProviderWarnings.get(p.id) ?? []), warning]);
  };

  providers.forEach((p, i) => {
    const outcome = settled[i] as PromiseSettledResult<Outcome>;

    if (outcome.status === 'rejected') {
      failures++;
      serviceabilities.push('UNKNOWN');
      const err: unknown = outcome.reason;
      if (err instanceof TimeoutError) {
        failureDetails.push({ provider: p.name, reason: 'TIMEOUT' });
        const message = `${p.name} did not respond in time, so it is not included.`;
        addUnavailable(p, 'UNKNOWN', 'TIMEOUT', message, {
          code: 'PROVIDER_TIMEOUT',
          providerId: p.id,
          message,
        });
      } else if (err instanceof NotConfiguredError) {
        failureDetails.push({ provider: p.name, reason: 'NOT_CONFIGURED' });
        const message = `${p.name} has no live integration configured, so it is not included.`;
        addUnavailable(p, 'UNKNOWN', 'NOT_CONFIGURED', message, {
          code: 'PROVIDER_ERROR',
          providerId: p.id,
          message,
        });
      } else {
        log(`compare: adapter for ${p.name} failed`, err);
        failureDetails.push({ provider: p.name, reason: 'ERROR' });
        const message = `${p.name} could not be queried right now, so it is not included.`;
        addUnavailable(p, 'UNKNOWN', 'ERROR', message, {
          code: 'PROVIDER_ERROR',
          providerId: p.id,
          message,
        });
      }
      return;
    }

    const { value } = outcome;
    serviceabilities.push(value.svc.status);

    if (value.kind === 'not_serving') {
      addUnavailable(
        p,
        'UNAVAILABLE',
        'NOT_SERVING',
        `${p.name} does not deliver to ${req.pinCode}.`,
      );
      return;
    }
    if (value.kind === 'no_quote') {
      const message = `${p.name} has no price data for ${req.pinCode}, so it cannot be compared. This does not mean it does not deliver there.`;
      addUnavailable(p, value.svc.status, 'NO_QUOTE', message, {
        code: 'NO_QUOTE',
        providerId: p.id,
        message,
      });
      return;
    }

    try {
      const b = buildProviderResult(p, value.svc, value.quote, basket, names, req, deps, now);
      if (b.resolved.status === 'UNAVAILABLE') {
        const message = `${p.name} reports its data as unavailable, so it is not included.`;
        addUnavailable(p, value.svc.status, 'QUOTE_UNAVAILABLE', message, {
          code: 'NO_QUOTE',
          providerId: p.id,
          message,
        });
        return;
      }
      built.push(b);
      perProviderWarnings.set(p.id, providerWarnings(b, req));
    } catch (err) {
      // e.g. corrupt price data: contain it to this provider
      failures++;
      log(`compare: could not process the quote from ${p.name}`, err);
      failureDetails.push({ provider: p.name, reason: 'ERROR' });
      const message = `${p.name} returned data that could not be used, so it is not included.`;
      addUnavailable(p, value.svc.status, 'ERROR', message, {
        code: 'PROVIDER_ERROR',
        providerId: p.id,
        message,
      });
    }
  });

  if (providers.length > 0 && failures === providers.length) {
    throw new AppError(
      502,
      'PROVIDERS_UNAVAILABLE',
      'None of the providers could be reached. Please try again shortly.',
      failureDetails,
    );
  }

  // ---- rank ---------------------------------------------------------------------------------
  const rows: RankRow[] = built.map((b) => ({
    providerId: b.result.providerId,
    name: b.result.name,
    eligible: isEligible(b.coverage, req.mode),
    estimatedTotal: b.result.estimatedTotal,
    etaMinutes: b.result.etaMinutes,
    status: b.resolved.status,
    built: b,
  }));

  const weights: Weights | null =
    req.sortBy === 'balance' ? (req.weights ?? DEFAULT_WEIGHTS) : null;
  type Ranking = {
    ranked: (RankRow & { rank: number; score?: number; priceNorm?: number; timeNorm?: number })[];
    excluded: { item: RankRow; reason: ExcludeReason }[];
    warnings: EngineWarning[];
  };
  const ranking: Ranking =
    req.sortBy === 'total'
      ? rankCheapest(rows)
      : req.sortBy === 'eta'
        ? rankFastest(rows)
        : rankBalanced(rows, weights ?? DEFAULT_WEIGHTS);

  const results: RankedProviderResult[] = ranking.ranked.map((r) => ({
    ...r.built.result,
    rank: r.rank,
    ...(r.score === undefined
      ? {}
      : {
          score: round6(r.score),
          priceNorm: round6(r.priceNorm ?? 0),
          timeNorm: round6(r.timeNorm ?? 0),
        }),
  }));

  const partialResults: ProviderResult[] = [];
  const unrankedResults: UnrankedProviderResult[] = [];
  for (const { item, reason } of ranking.excluded) {
    if (reason === 'NOT_ELIGIBLE') {
      // full-basket mode: missing items. partial mode: nothing at all is available.
      if (req.mode === 'full-basket') partialResults.push(item.built.result);
      else unrankedResults.push({ ...item.built.result, unrankedReason: 'NO_ITEMS' });
    } else {
      unrankedResults.push({
        ...item.built.result,
        unrankedReason: UNRANKED[reason] ?? 'NULL_TOTAL',
      });
    }
  }
  partialResults.sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name));
  unrankedResults.sort((a, b) => a.name.localeCompare(b.name));
  unavailable.sort((a, b) => a.name.localeCompare(b.name));

  // ---- warnings -----------------------------------------------------------------------------
  const isSampleData =
    providers.some((p) => p.dataSourceType === 'SEED') || built.some((b) => b.result.isSample);
  const warnings: EngineWarning[] = [];
  if (isSampleData) {
    warnings.push({
      code: 'DEMO_DATA',
      message:
        'Demo data: every price, fee and delivery time here is sample data for fictional providers, not live information.',
    });
  }
  if (providers.length > 0 && !serviceabilities.includes('AVAILABLE')) {
    if (serviceabilities.every((s) => s === 'UNAVAILABLE')) {
      warnings.push({
        code: 'PIN_UNSUPPORTED',
        message: `No provider in this prototype delivers to ${req.pinCode}.`,
      });
    } else if (failures === 0) {
      warnings.push({
        code: 'PIN_UNKNOWN',
        message: `We have no confirmed delivery data for ${req.pinCode}. That does not mean it is not served.`,
      });
    }
  }
  for (const p of providers) warnings.push(...(perProviderWarnings.get(p.id) ?? []));
  warnings.push(...ranking.warnings);

  return {
    pinCode: req.pinCode,
    mode: req.mode,
    sortBy: req.sortBy,
    weights,
    allowSubstitutes: req.allowSubstitutes,
    generatedAt: now.toISOString(),
    isSampleData,
    basket: basketInfo,
    results,
    partialResults,
    unrankedResults,
    unavailableProviders: unavailable,
    warnings,
  };
}
