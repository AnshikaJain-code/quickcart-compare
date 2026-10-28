import { normalizeUnit, parseUnitAlias, type NormalizedQuantity } from './units';

export interface ParsedTitle {
  original: string;
  /** Lower case, accents and punctuation removed, digits split from letters, whitespace collapsed. */
  normalized: string;
  /** Content words only: the size text and packaging/filler words are removed. Not singularised. */
  tokens: string[];
  /** Per-unit size in base units, or null when the title states none. */
  size: NormalizedQuantity | null;
  /** 1 for a normal pack; 2 for "2 x 500 ml" or "100 g pack of 2". */
  packCount: number;
}

/** Packaging and glue words that say nothing about WHICH product it is. */
const FILLERS = new Set([
  'pack',
  'packet',
  'pkt',
  'pouch',
  'bottle',
  'tin',
  'can',
  'bag',
  'box',
  'jar',
  'sachet',
  'of',
  'the',
  'and',
  'with',
  'in',
  'a',
  'for',
  'by',
]);

export function isFiller(token: string): boolean {
  return FILLERS.has(token);
}

/** Core text clean-up shared by titles, brands and pack sizes. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/×/g, ' x ')
    .replace(/['’`]/g, '')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const MULTI_RE = new RegExp(String.raw`(?<![\d.])(\d+)\s*x\s*${NUM}\s*([a-z]+)`);
const SIZE_RE = new RegExp(String.raw`(?<![\d.])${NUM}\s*([a-z]+)`, 'g');
const PACK_OF_RE = /\bpack of (\d+)\b/;

function cut(text: string, start: number, length: number): string {
  return `${text.slice(0, start)} ${text.slice(start + length)}`;
}

export function parseProductTitle(title: string): ParsedTitle {
  let work = normalizeText(title);
  let size: NormalizedQuantity | null = null;
  let packCount = 1;
  let sizeWasPcs = false;

  // 1. "2 x 500 ml" bundles
  const multi = MULTI_RE.exec(work);
  if (multi) {
    const count = Number(multi[1]);
    const q = normalizeUnit(Number(multi[2]), multi[3] as string);
    if (q && count >= 1) {
      size = q;
      packCount = count;
      work = cut(work, multi.index, multi[0].length);
      work = work.replace(PACK_OF_RE, ' '); // "(pack of 2)" repeats the bundle count
    }
  }

  // 2. a plain "500 ml" / "6 pcs" (first valid number + unit wins)
  if (!size) {
    for (const m of work.matchAll(SIZE_RE)) {
      if (!parseUnitAlias(m[2] as string)) continue;
      const q = normalizeUnit(Number(m[1]), m[2] as string);
      if (!q) continue;
      size = q;
      sizeWasPcs = q.unit === 'pcs';
      work = cut(work, m.index as number, m[0].length);
      break;
    }
  }

  // 3. "pack of N"
  const pack = PACK_OF_RE.exec(work);
  if (pack) {
    const n = Number(pack[1]);
    if (!size) {
      size = { value: n, unit: 'pcs' }; // "Eggs Pack of 6" means 6 pieces
    } else if (n > 1 && !(sizeWasPcs && n === size.value)) {
      packCount = n; // "100 g pack of 3" is a bundle
    }
    work = cut(work, pack.index, pack[0].length);
  }

  const tokens = work.split(' ').filter((t) => t && !FILLERS.has(t));
  return {
    original: title,
    normalized: normalizeText(title).replace(/(\d)([a-z])/g, '$1 $2'),
    tokens,
    size,
    packCount,
  };
}
