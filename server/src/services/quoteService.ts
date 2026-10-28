import { isValidObjectId } from 'mongoose';
import { AppError } from '../middleware/errors';
import { CanonicalProduct } from '../models/CanonicalProduct';
import { Provider } from '../models/Provider';
import { ProviderListing } from '../models/ProviderListing';
import { Quote } from '../models/Quote';
import { FEE_FIELDS, type FeeField } from './engineTypes';
import { resolveStatus } from './status';

export interface QuoteDetail {
  id: string;
  provider: { id: string; name: string; slug: string };
  pinCode: string;
  currency: string;
  /** Status after staleness is applied now. */
  status: string;
  storedStatus: string;
  isStale: boolean;
  isSample: boolean;
  retrievedAt: string;
  expiresAt: string;
  etaMinutes: number | null;
  fees: Record<FeeField, number | null>;
  discounts: {
    code: string | null;
    label: string;
    type: string;
    value: number;
    minOrderValue: number | null;
    maxDiscount: number | null;
  }[];
  items: {
    listingId: string;
    title: string;
    brand: string;
    packSize: string;
    canonicalProductId: string | null;
    productName: string | null;
    matchStatus: string;
    unitPrice: number;
    inStock: boolean;
  }[];
  officialCheckoutUrl: string | null;
  source: string;
  createdAt: string;
}

export async function getQuoteDetail(
  id: string,
  now: Date,
  staleAfterMinutes?: number,
): Promise<QuoteDetail> {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Quote not found');
  const quote = await Quote.findById(id).lean();
  if (!quote) throw new AppError(404, 'NOT_FOUND', 'Quote not found');

  const [provider, listings] = await Promise.all([
    Provider.findById(quote.providerId).lean(),
    ProviderListing.find({ _id: { $in: quote.items.map((i) => i.listingId) } }).lean(),
  ]);
  const listingById = new Map(listings.map((l) => [String(l._id), l]));
  const productIds = [...new Set(listings.map((l) => l.canonicalProductId).filter(Boolean))];
  const products = await CanonicalProduct.find({ _id: { $in: productIds } }).lean();
  const productName = new Map(
    products.map((p) => [
      String(p._id),
      `${p.name}${p.variant ? ` ${p.variant}` : ''} ${p.packLabel}`,
    ]),
  );

  const resolved = resolveStatus(
    {
      sourceStatus: quote.sourceStatus,
      retrievedAt: quote.retrievedAt,
      expiresAt: quote.expiresAt,
    },
    now,
    { staleAfterMinutes },
  );

  const fees = Object.fromEntries(
    FEE_FIELDS.map((f) => [
      f,
      (quote as unknown as Record<FeeField, number | null | undefined>)[f] ?? null,
    ]),
  ) as Record<FeeField, number | null>;

  return {
    id: String(quote._id),
    provider: {
      id: String(quote.providerId),
      name: provider?.name ?? 'Unknown provider',
      slug: provider?.slug ?? '',
    },
    pinCode: quote.pinCode,
    currency: quote.currency ?? 'INR',
    status: resolved.status,
    storedStatus: resolved.storedStatus,
    isStale: resolved.isStale,
    isSample: resolved.isSample,
    retrievedAt: quote.retrievedAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
    etaMinutes: quote.etaMinutes ?? null,
    fees,
    discounts: quote.discounts.map((d) => ({
      code: d.code ?? null,
      label: d.label,
      type: d.type,
      value: d.value,
      minOrderValue: d.minOrderValue ?? null,
      maxDiscount: d.maxDiscount ?? null,
    })),
    items: quote.items.map((i) => {
      const l = listingById.get(String(i.listingId));
      const canonical = l?.canonicalProductId ? String(l.canonicalProductId) : null;
      return {
        listingId: String(i.listingId),
        title: l?.title ?? '',
        brand: l?.brand ?? '',
        packSize: l?.packSize ?? '',
        canonicalProductId: canonical,
        productName: canonical ? (productName.get(canonical) ?? null) : null,
        matchStatus: l?.matchStatus ?? 'UNMATCHED',
        unitPrice: i.unitPrice,
        inStock: i.inStock,
      };
    }),
    officialCheckoutUrl: quote.officialCheckoutUrl ?? null,
    source: quote.source,
    createdAt: quote.createdAt.toISOString(),
  };
}
