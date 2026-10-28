/**
 * Money helpers. All arithmetic is done in integer paise so that sums like 0.10 + 0.20
 * are exact. Amounts in and out of the engine are rupees with at most two decimals.
 */
export function toPaise(rupees: number): number {
  return Math.round(Number((rupees * 100).toPrecision(12)));
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function assertMoney(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative amount (got ${String(value)})`);
  }
}
