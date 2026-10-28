import { describe, expect, it } from 'vitest';
import { normalizeUnit, parseUnitAlias } from '../services/units';

describe('parseUnitAlias', () => {
  it.each([
    ['ml', 'ml'],
    ['ML', 'ml'],
    ['millilitre', 'ml'],
    ['Milliliters', 'ml'],
    ['l', 'l'],
    ['L', 'l'],
    ['ltr', 'l'],
    ['Ltrs', 'l'],
    ['litre', 'l'],
    ['liters', 'l'],
    ['g', 'g'],
    ['gm', 'g'],
    ['GMS', 'g'],
    ['gram', 'g'],
    ['grams', 'g'],
    ['kg', 'kg'],
    ['KGS', 'kg'],
    ['kilo', 'kg'],
    ['kilogram', 'kg'],
    ['pcs', 'pcs'],
    ['pc', 'pcs'],
    ['piece', 'pcs'],
    ['pieces', 'pcs'],
    ['units', 'pcs'],
    ['count', 'pcs'],
  ])('%s -> %s', (text, unit) => {
    expect(parseUnitAlias(text)).toBe(unit);
  });

  it('returns null for unknown or empty units', () => {
    for (const bad of ['', '  ', 'oz', 'liquid', 'boxes', 'x'])
      expect(parseUnitAlias(bad)).toBeNull();
  });
});

describe('normalizeUnit', () => {
  it('converts to base units (ml, g, pcs) and never mixes families', () => {
    expect(normalizeUnit(1, 'L')).toEqual({ value: 1000, unit: 'ml' });
    expect(normalizeUnit(0.5, 'l')).toEqual({ value: 500, unit: 'ml' });
    expect(normalizeUnit(2.25, 'litre')).toEqual({ value: 2250, unit: 'ml' });
    expect(normalizeUnit(500, 'ML')).toEqual({ value: 500, unit: 'ml' });
    expect(normalizeUnit(1.5, 'kg')).toEqual({ value: 1500, unit: 'g' });
    expect(normalizeUnit(250, 'gm')).toEqual({ value: 250, unit: 'g' });
    expect(normalizeUnit(6, 'pcs')).toEqual({ value: 6, unit: 'pcs' });
  });

  it('500 ml and 1 L are different; 500 ml and 0.5 L are the same', () => {
    expect(normalizeUnit(500, 'ml')).not.toEqual(normalizeUnit(1, 'l'));
    expect(normalizeUnit(500, 'ml')).toEqual(normalizeUnit(0.5, 'l'));
    // 1 kg of something is never 1 L of something
    expect(normalizeUnit(1, 'kg')).not.toEqual(normalizeUnit(1, 'l'));
  });

  it('returns null for unknown units and invalid values', () => {
    expect(normalizeUnit(1, 'oz')).toBeNull();
    expect(normalizeUnit(0, 'ml')).toBeNull();
    expect(normalizeUnit(-5, 'ml')).toBeNull();
    expect(normalizeUnit(Number.NaN, 'ml')).toBeNull();
    expect(normalizeUnit(Number.POSITIVE_INFINITY, 'g')).toBeNull();
  });
});
