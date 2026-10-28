import type { QuantityUnit } from '../models/enums';

export type BaseUnit = 'ml' | 'g' | 'pcs';

/** Converts a quantity to its base unit (litres to ml, kg to g). Rounds to avoid float noise. */
export function toBaseQuantity(
  value: number,
  unit: QuantityUnit,
): { value: number; unit: BaseUnit } {
  switch (unit) {
    case 'ml':
      return { value: Math.round(value), unit: 'ml' };
    case 'l':
      return { value: Math.round(value * 1000), unit: 'ml' };
    case 'g':
      return { value: Math.round(value), unit: 'g' };
    case 'kg':
      return { value: Math.round(value * 1000), unit: 'g' };
    case 'pcs':
      return { value: Math.round(value), unit: 'pcs' };
  }
}

const DISPLAY: Record<QuantityUnit, string> = { ml: 'ml', l: 'L', g: 'g', kg: 'kg', pcs: 'pcs' };

/** Human label such as "500 ml", "1 L", "2.25 L", "6 pcs". */
export function formatPackLabel(value: number, unit: QuantityUnit): string {
  return `${value} ${DISPLAY[unit]}`;
}

// ---------------------------------------------------------------------------
// Unit text -> canonical unit, and size normalisation used by the matcher.
// ---------------------------------------------------------------------------

const UNIT_ALIASES: Record<string, QuantityUnit> = {
  ml: 'ml',
  mls: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  lt: 'l',
  ltr: 'l',
  ltrs: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  g: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  pc: 'pcs',
  pcs: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  unit: 'pcs',
  units: 'pcs',
  count: 'pcs',
  ct: 'pcs',
};

/** "Ltr", "GMS", "pieces" -> 'l', 'g', 'pcs'. Returns null when the text is not a known unit. */
export function parseUnitAlias(text: string): QuantityUnit | null {
  const key = text.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(UNIT_ALIASES, key)
    ? (UNIT_ALIASES[key] as QuantityUnit)
    : null;
}

export interface NormalizedQuantity {
  value: number;
  unit: BaseUnit;
}

/**
 * Normalises a quantity written in any common spelling to a base unit (ml, g or pcs).
 * normalizeUnit(0.5, 'L') -> { value: 500, unit: 'ml' }. Returns null for unknown units or
 * non-positive / non-finite values. Different families (ml vs g) never compare equal.
 */
export function normalizeUnit(value: number, unit: string): NormalizedQuantity | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const canonical = parseUnitAlias(unit);
  if (!canonical) return null;
  const base = toBaseQuantity(value, canonical);
  return base.value > 0 ? base : null;
}

export function sameQuantity(a: NormalizedQuantity | null, b: NormalizedQuantity | null): boolean {
  return a !== null && b !== null && a.unit === b.unit && a.value === b.value;
}
