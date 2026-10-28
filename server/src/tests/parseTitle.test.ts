import { describe, expect, it } from 'vitest';
import { parseProductTitle } from '../services/titleParser';

describe('parseProductTitle: size', () => {
  it.each([
    ['Milk 500 ml', { value: 500, unit: 'ml' }],
    ['Milk 500ml', { value: 500, unit: 'ml' }],
    ['MILK 500 ML', { value: 500, unit: 'ml' }],
    ['Milk 0.5 L', { value: 500, unit: 'ml' }],
    ['Milk 1 Ltr', { value: 1000, unit: 'ml' }],
    ['Cola 2.25 L', { value: 2250, unit: 'ml' }],
    ['Rice 1kg', { value: 1000, unit: 'g' }],
    ['Rice 1,000 g', { value: 1000, unit: 'g' }],
    ['Coffee 100gm', { value: 100, unit: 'g' }],
    ['Chips 52 G.', { value: 52, unit: 'g' }],
    ['Eggs 12 pcs', { value: 12, unit: 'pcs' }],
    ['Eggs Pack of 6', { value: 6, unit: 'pcs' }],
    ['Banana (6 pcs)', { value: 6, unit: 'pcs' }],
  ])('%s', (title, size) => {
    const p = parseProductTitle(title);
    expect(p.size).toEqual(size);
    expect(p.packCount).toBe(1);
  });

  it('returns no size when none is written', () => {
    expect(parseProductTitle('Meadow Fresh Toned Milk').size).toBeNull();
    expect(parseProductTitle('Rice for 2 people').size).toBeNull();
    expect(parseProductTitle('').size).toBeNull();
  });

  it('detects multipacks and keeps the per-unit size', () => {
    for (const t of ['Milk 2 x 500 ml', 'Milk 2x500ml', 'MILK 2 × 500 ML (PACK OF 2)']) {
      const p = parseProductTitle(t);
      expect(p.packCount).toBe(2);
      expect(p.size).toEqual({ value: 500, unit: 'ml' });
    }
    // "Pack of 2" on a sized item is also a bundle, but "6 pcs (pack of 6)" is just 6 pieces
    expect(parseProductTitle('Soap 100 g pack of 3').packCount).toBe(3);
    expect(parseProductTitle('Eggs 6 pcs (pack of 6)').packCount).toBe(1);
  });
});

describe('parseProductTitle: tokens', () => {
  it('lower-cases, strips punctuation and accents, drops the size and packaging words', () => {
    expect(parseProductTitle('Milk - Toned (Meadow Fresh) 500ml').tokens).toEqual([
      'milk',
      'toned',
      'meadow',
      'fresh',
    ]);
    expect(parseProductTitle('MEADOW FRESH MILK TONED 0.5 L').tokens).toEqual([
      'meadow',
      'fresh',
      'milk',
      'toned',
    ]);
    expect(parseProductTitle('Golden Crust Bread 400 g Pouch').tokens).toEqual([
      'golden',
      'crust',
      'bread',
    ]);
    expect(parseProductTitle('Café   au  Lait 100g').tokens).toEqual(['cafe', 'au', 'lait']);
  });

  it('removes apostrophes inside words and treats & as a filler', () => {
    expect(parseProductTitle("Nature's Own Eggs 12 pcs").tokens).toEqual([
      'natures',
      'own',
      'eggs',
    ]);
    expect(parseProductTitle('Cream & Onion Chips 52 g').tokens).toEqual([
      'cream',
      'onion',
      'chips',
    ]);
  });

  it('keeps the original text and a normalised copy, and does not mutate input', () => {
    const title = '  Milk   500ML ';
    const p = parseProductTitle(title);
    expect(p.original).toBe(title);
    expect(p.normalized).toBe('milk 500 ml');
    expect(title).toBe('  Milk   500ML ');
  });
});
