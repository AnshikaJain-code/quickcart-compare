import { describe, expect, it } from 'vitest';
import { isUsableMatch, matchListing, type CandidateProduct } from '../services/matching';
import { PRODUCTS } from '../seed/data';
import { buildListingSpecs } from '../seed/listings';

const catalogue: CandidateProduct[] = PRODUCTS.map((p) => ({
  id: p.key,
  name: p.name,
  brand: p.brand,
  variant: p.variant,
  quantityValue: p.qty,
  quantityUnit: p.unit,
  gtin: p.gtin ?? null,
}));
const only = (...keys: string[]) => catalogue.filter((c) => keys.includes(c.id));
const MF = 'Meadow Fresh';

describe('matchListing: EXACT', () => {
  it('needs brand + variant + normalised size + unit equal, and has confidence 1', () => {
    const r = matchListing({ title: 'Meadow Fresh Toned Milk 500 ml', brand: MF }, catalogue);
    expect(r).toMatchObject({
      matchStatus: 'EXACT',
      matchConfidence: 1,
      canonicalProductId: 'milk-tt-500',
    });
  });

  it('treats 0.5 L, 500ml and 500 ML as the same size', () => {
    for (const t of [
      'Meadow Fresh Toned Milk 0.5 L',
      'Toned Milk (Meadow Fresh) 500ml',
      'MEADOW FRESH TONED MILK 500 ML',
    ]) {
      expect(matchListing({ title: t, brand: MF }, catalogue).canonicalProductId).toBe(
        'milk-tt-500',
      );
    }
  });

  it('500 ml is never EXACT for a 1 L product (and vice versa)', () => {
    const onlyLitre = matchListing(
      { title: 'Meadow Fresh Toned Milk 500 ml', brand: MF },
      only('milk-tt-1000'),
    );
    expect(onlyLitre.matchStatus).toBe('UNMATCHED');
    expect(onlyLitre.canonicalProductId).toBeNull();
    const onlyHalf = matchListing(
      { title: 'Meadow Fresh Toned Milk 1 L', brand: MF },
      only('milk-tt-500'),
    );
    expect(onlyHalf.matchStatus).toBe('UNMATCHED');
    // with both in the catalogue each lands on its own size
    expect(
      matchListing({ title: 'Meadow Fresh Toned Milk 1 L', brand: MF }, catalogue)
        .canonicalProductId,
    ).toBe('milk-tt-1000');
  });

  it('never matches across unit families (ml vs g)', () => {
    expect(
      matchListing({ title: 'Meadow Fresh Toned Milk 500 g', brand: MF }, catalogue).matchStatus,
    ).toBe('UNMATCHED');
  });
});

describe('matchListing: fuzzy matches max out at LIKELY', () => {
  it('a typo is LIKELY with confidence below 1', () => {
    const r = matchListing(
      { title: 'Pure Press Sunflowr Oil 1 L', brand: 'Pure Press' },
      catalogue,
    );
    expect(r.matchStatus).toBe('LIKELY');
    expect(r.canonicalProductId).toBe('oil-1000');
    expect(r.matchConfidence).toBeGreaterThanOrEqual(0.5);
    expect(r.matchConfidence).toBeLessThan(1);
  });

  it('unknown brand, missing variant, missing size or extra words are LIKELY, not EXACT', () => {
    const cases: [string, string | undefined][] = [
      ['Toned Milk 500 ml', undefined],
      ['MEADOW FRESH BUTTER 100G', MF],
      ['Sweet Leaf Refined Sugar', 'Sweet Leaf'],
      ['Harvest Gold Toor Dal 1 kg (Premium)', 'Harvest Gold'],
    ];
    for (const [title, brand] of cases) {
      const r = matchListing({ title, brand }, catalogue);
      expect(r.matchStatus).toBe('LIKELY');
      expect(r.matchConfidence).toBeGreaterThanOrEqual(0.5);
      expect(r.matchConfidence).toBeLessThanOrEqual(0.95);
    }
  });
});

describe('matchListing: SUBSTITUTE, GTIN and rejections', () => {
  it('a different brand of the same item and size is SUBSTITUTE', () => {
    const r = matchListing(
      { title: 'Daily Value Full Cream Milk 500 ml', brand: 'Daily Value' },
      catalogue,
    );
    expect(r).toMatchObject({
      matchStatus: 'SUBSTITUTE',
      canonicalProductId: 'milk-fc-500',
      matchConfidence: 0.6,
    });
  });

  it('a different brand with a different size is not a substitute', () => {
    expect(
      matchListing(
        { title: 'Daily Value Full Cream Milk 1 L', brand: 'Daily Value' },
        only('milk-fc-500'),
      ).matchStatus,
    ).toBe('UNMATCHED');
  });

  it('GTIN comes first: it matches even when the title is unhelpful', () => {
    const r = matchListing({ title: 'MF Toned Milk Pouch', gtin: '2000000000015' }, catalogue);
    expect(r).toMatchObject({
      matchStatus: 'EXACT',
      matchConfidence: 1,
      canonicalProductId: 'milk-tt-500',
    });
  });

  it('GTIN comparison ignores leading zeros and spaces', () => {
    expect(
      matchListing({ title: 'Toned Milk', gtin: '02000000000015' }, catalogue).canonicalProductId,
    ).toBe('milk-tt-500');
    expect(
      matchListing({ title: 'Toned Milk', gtin: '2000 0000 00015' }, catalogue).canonicalProductId,
    ).toBe('milk-tt-500');
  });

  it('a GTIN that contradicts the title (size) is a conflict, not a match', () => {
    const r = matchListing(
      { title: 'Meadow Fresh Toned Milk 500 ml', brand: MF, gtin: '2000000000022' },
      catalogue,
    );
    expect(r.matchStatus).toBe('UNMATCHED');
    expect(r.reasons.join(' ')).toMatch(/gtin/i);
  });

  it('a different barcode rules out a catalogue item that has its own barcode', () => {
    expect(
      matchListing(
        { title: 'Meadow Fresh Toned Milk 500 ml', brand: MF, gtin: '9999999999994' },
        catalogue,
      ).matchStatus,
    ).toBe('UNMATCHED');
  });

  it('a barcode we do not know does not block a title match on an item with no barcode', () => {
    expect(
      matchListing(
        { title: 'Meadow Fresh Set Curd 400 g', brand: MF, gtin: '2000000000039' },
        catalogue,
      ).matchStatus,
    ).toBe('EXACT');
  });

  it('bundles are never matched to a single pack', () => {
    const r = matchListing(
      { title: 'MEADOW FRESH MILK TONED 2 x 500 ML (PACK OF 2)', brand: MF },
      catalogue,
    );
    expect(r.matchStatus).toBe('UNMATCHED');
    expect(r.reasons.join(' ')).toMatch(/multipack|bundle/i);
  });

  it('differentiating words (diet, decaf, strawberry...) make it a different product', () => {
    for (const t of [
      'Fizz Works Diet Cola 750 ml',
      'Brew House Instant Coffee Decaf 100 g',
      'Meadow Fresh Strawberry Milk 500 ml',
    ]) {
      expect(matchListing({ title: t }, catalogue).matchStatus).toBe('UNMATCHED');
    }
  });

  it('ambiguity is UNMATCHED and lists the candidates for a reviewer', () => {
    const r = matchListing({ title: 'Meadow Fresh Milk 500 ml', brand: MF }, catalogue);
    expect(r.matchStatus).toBe('UNMATCHED');
    expect(r.canonicalProductId).toBeNull();
    expect(r.matchConfidence).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(['milk-fc-500', 'milk-tt-500']);
  });

  it('a conflicting size between the title and packSize is not trusted', () => {
    expect(
      matchListing(
        { title: 'Meadow Fresh Toned Milk 500 ml', brand: MF, packSize: '1 L' },
        catalogue,
      ).matchStatus,
    ).toBe('UNMATCHED');
    expect(
      matchListing({ title: 'Meadow Fresh Toned Milk', brand: MF, packSize: '500ml' }, catalogue)
        .canonicalProductId,
    ).toBe('milk-tt-500');
  });

  it('empty titles and empty catalogues are UNMATCHED, not errors', () => {
    expect(matchListing({ title: '   ' }, catalogue).matchStatus).toBe('UNMATCHED');
    expect(matchListing({ title: 'Toned Milk 500 ml' }, []).matchStatus).toBe('UNMATCHED');
  });

  it('is deterministic and does not mutate its inputs', () => {
    const listing = { title: 'Meadow Fresh Toned Milk 500 ml', brand: MF };
    const snapshot = JSON.stringify([listing, catalogue]);
    const a = matchListing(listing, catalogue);
    const b = matchListing(listing, [...catalogue].reverse());
    expect(a).toEqual(b);
    expect(JSON.stringify([listing, catalogue])).toBe(snapshot);
  });

  it('keeps the invariants: only mapped statuses carry a product and a confidence', () => {
    for (const t of [
      'Meadow Fresh Toned Milk 500 ml',
      'Toned Milk 500 ml',
      'zzz 5 kg',
      'Meadow Fresh Milk 500 ml',
    ]) {
      const r = matchListing(
        { title: t, brand: t.startsWith('Meadow') ? MF : undefined },
        catalogue,
      );
      if (r.matchStatus === 'UNMATCHED') {
        expect(r.canonicalProductId).toBeNull();
        expect(r.matchConfidence).toBeNull();
      } else {
        expect(r.canonicalProductId).not.toBeNull();
        expect(r.matchConfidence).toBeGreaterThan(0);
        expect(r.matchConfidence).toBeLessThanOrEqual(1);
        if (r.matchStatus !== 'EXACT') expect(r.matchConfidence).toBeLessThan(1);
      }
    }
  });
});

describe('isUsableMatch (opt-in rules for pricing)', () => {
  it('EXACT is always usable; SUBSTITUTE only with opt-in; LIKELY and UNMATCHED never', () => {
    expect(isUsableMatch('EXACT', false)).toBe(true);
    expect(isUsableMatch('SUBSTITUTE', false)).toBe(false);
    expect(isUsableMatch('SUBSTITUTE', true)).toBe(true);
    expect(isUsableMatch('LIKELY', true)).toBe(false);
    expect(isUsableMatch('UNMATCHED', true)).toBe(false);
  });
});

describe('the matcher agrees with every seeded listing (119)', () => {
  const specs = buildListingSpecs();
  it('has all the seeded listings', () => expect(specs).toHaveLength(119));

  it.each(specs.map((s) => [s.providerProductId, s] as const))('%s', (_id, s) => {
    const r = matchListing({ title: s.title, brand: s.brand, packSize: s.packSize }, catalogue);
    expect(r.matchStatus).toBe(s.matchStatus);
    expect(r.canonicalProductId).toBe(s.canonicalKey);
  });
});
