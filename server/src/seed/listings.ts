/**
 * Pure construction of the sample provider listings (no database). Each provider writes the
 * same product differently; a few listings are deliberately LIKELY, SUBSTITUTE or UNMATCHED.
 */
import type { MatchStatus, QuantityUnit } from '../models/enums';
import {
  EXTRA_LISTINGS,
  LISTING_OVERRIDES,
  PRODUCTS,
  PROVIDERS,
  type ProductSeed,
  type ProviderKey,
} from './data';

const UNIT_SHOWN: Record<QuantityUnit, string> = { ml: 'ml', l: 'L', g: 'g', kg: 'kg', pcs: 'pcs' };

function styleA(p: ProductSeed) {
  const size = `${p.qty} ${UNIT_SHOWN[p.unit]}`;
  return { title: [p.brand, p.variant, p.name, size].filter(Boolean).join(' '), packSize: size };
}

function styleB(p: ProductSeed) {
  const size = `${p.qty}${UNIT_SHOWN[p.unit].toLowerCase()}`;
  const head = p.variant ? `${p.name} - ${p.variant}` : p.name;
  return { title: `${head} (${p.brand}) ${size}`, packSize: size };
}

function styleC(p: ProductSeed) {
  let size: string;
  if (p.unit === 'ml') size = `${p.qty / 1000} L`;
  else if (p.unit === 'l') size = `${p.qty} L`;
  else if (p.unit === 'g') size = p.qty >= 1000 ? `${p.qty / 1000} KG` : `${p.qty} G`;
  else if (p.unit === 'kg') size = `${p.qty} KG`;
  else size = `PACK OF ${p.qty}`;
  const title = [p.brand, p.name, p.variant, size].filter(Boolean).join(' ').toUpperCase();
  return { title, packSize: size };
}

const STYLES = { A: styleA, B: styleB, C: styleC } as const;

export interface ListingSpec {
  provider: ProviderKey;
  providerProductId: string;
  title: string;
  brand: string;
  packSize: string;
  matchStatus: MatchStatus;
  matchConfidence: number | null;
  /** Seed product key this listing maps to; null for UNMATCHED look-alikes. */
  canonicalKey: string | null;
  /** Key used to derive the listing id (a product key, or `extra:<title>`). */
  listingKey: string;
  price: number;
}

export function buildListingSpecs(): ListingSpec[] {
  const specs: ListingSpec[] = [];
  PROVIDERS.forEach((prov, pi) => {
    let n = 0;
    const nextId = () => `${prov.key}-${String(++n).padStart(4, '0')}`;

    for (const p of PRODUCTS) {
      const price = p.prices[pi];
      if (price === null || price === undefined) continue; // not listed by this provider
      const base = STYLES[prov.key](p);
      const o = LISTING_OVERRIDES[`${prov.key}:${p.key}`];
      specs.push({
        provider: prov.key,
        providerProductId: nextId(),
        title: o?.title ?? base.title,
        brand: o?.brand ?? p.brand,
        packSize: base.packSize,
        matchStatus: o?.matchStatus ?? 'EXACT',
        matchConfidence: o?.matchConfidence ?? 1,
        canonicalKey: p.key,
        listingKey: p.key,
        price,
      });
    }

    for (const x of EXTRA_LISTINGS.filter((e) => e.provider === prov.key)) {
      specs.push({
        provider: prov.key,
        providerProductId: nextId(),
        title: x.title,
        brand: x.brand,
        packSize: x.packSize,
        matchStatus: 'UNMATCHED',
        matchConfidence: null,
        canonicalKey: null,
        listingKey: `extra:${x.title}`,
        price: x.price,
      });
    }
  });
  return specs;
}
