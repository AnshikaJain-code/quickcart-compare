/**
 * Listing-to-catalogue matching. Pure: no database, no network.
 *
 * Rules (CLAUDE.md "Core logic"):
 *  - EXACT needs brand + variant + normalised size + unit equal (GTIN first when present).
 *  - Fuzzy similarity may only ever suggest LIKELY, never auto-confirm.
 *  - 500 ml is not 1 L: a size mismatch rules a candidate out completely.
 *  - A different brand of the same item is SUBSTITUTE (used only if the shopper opts in).
 *  - If the evidence is ambiguous the answer is UNMATCHED, never a guess.
 */
import type { MatchStatus, QuantityUnit } from '../models/enums';
import { isFiller, normalizeText, parseProductTitle } from './titleParser';
import { normalizeUnit, sameQuantity, type NormalizedQuantity } from './units';

export interface ListingInput {
  title: string;
  brand?: string | null;
  packSize?: string | null;
  gtin?: string | null;
}

export interface CandidateProduct {
  id: string;
  name: string;
  brand: string;
  variant?: string | null;
  quantityValue: number;
  quantityUnit: QuantityUnit;
  gtin?: string | null;
}

export interface MatchCandidateInfo {
  id: string;
  matchStatus: MatchStatus;
  confidence: number;
}

export interface MatchResult {
  matchStatus: MatchStatus;
  /** null for UNMATCHED; 1 only for EXACT; below 1 otherwise. */
  matchConfidence: number | null;
  canonicalProductId: string | null;
  reasons: string[];
  /** Best non-rejected candidates (max 3), for an admin to review. */
  candidates: MatchCandidateInfo[];
}

export const LIKELY_MIN_CONFIDENCE = 0.5;
export const LIKELY_MAX_CONFIDENCE = 0.95;
export const SUBSTITUTE_CONFIDENCE = 0.6;
/** Two candidates of the same kind closer than this are treated as a tie. */
export const AMBIGUITY_MARGIN = 0.05;

/** Only an EXACT match is always usable; SUBSTITUTE needs the shopper's opt-in; the rest never. */
export function isUsableMatch(status: MatchStatus, allowSubstitutes: boolean): boolean {
  return status === 'EXACT' || (status === 'SUBSTITUTE' && allowSubstitutes);
}

// ---- token handling -------------------------------------------------------------

const SYNONYMS: Record<string, string> = { tur: 'toor', thoor: 'toor', dahi: 'curd', aata: 'atta' };

function singular(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}
const canon = (t: string): string => {
  const s = singular(t);
  return SYNONYMS[s] ?? s;
};

/** Words that make it a different product. If the listing has one the catalogue item lacks, it is not a match. */
const DIFFERENTIATING = new Set([
  'diet',
  'zero',
  'sugarfree',
  'sugarless',
  'free',
  'light',
  'lite',
  'low',
  'fat',
  'double',
  'organic',
  'unsalted',
  'skimmed',
  'skim',
  'decaf',
  'decaffeinated',
  'flavoured',
  'flavored',
  'strawberry',
  'mango',
  'vanilla',
  'chocolate',
  'butterscotch',
  'pineapple',
  'lemon',
  'orange',
  'apple',
  'grape',
  'banana',
]);

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const wordsOf = (text: string): string[] =>
  normalizeText(text)
    .split(' ')
    .filter((t) => t && !isFiller(t));

function removeSequence(tokens: string[], seq: string[]): { tokens: string[]; found: boolean } {
  if (seq.length === 0) return { tokens, found: false };
  for (let i = 0; i + seq.length <= tokens.length; i++) {
    if (seq.every((s, k) => tokens[i + k] === s)) {
      return { tokens: [...tokens.slice(0, i), ...tokens.slice(i + seq.length)], found: true };
    }
  }
  return { tokens, found: false };
}

const normGtin = (g: string | null | undefined): string | null => {
  const d = (g ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return d ? d : null;
};

// ---- candidate evaluation --------------------------------------------------------

interface Prepared {
  tokens: string[]; // raw content tokens from the title
  size: NormalizedQuantity | null;
  brandTokens: string[];
  brandKey: string | null;
}

type Evaluation =
  | { ok: true; status: Exclude<MatchStatus, 'UNMATCHED'>; confidence: number; reasons: string[] }
  | { ok: false; reason: string };

const rejected = (reason: string): Evaluation => ({ ok: false, reason });
const round2 = (n: number) => Math.round(n * 100) / 100;

interface TokenMatch {
  matched: number;
  weight: number;
  fuzzy: boolean;
}

/** Consumes listing tokens (in `pool`) that match any of `wanted`. Exact first, then one-typo. */
function consume(wanted: string[], pool: string[], used: boolean[]): TokenMatch {
  let matched = 0;
  let weight = 0;
  let fuzzy = false;
  for (const w of wanted) {
    let idx = pool.findIndex((p, i) => !used[i] && p === w);
    let isFuzzy = false;
    if (idx < 0 && w.length >= 5) {
      idx = pool.findIndex((p, i) => !used[i] && p.length >= 5 && withinOneEdit(p, w));
      isFuzzy = idx >= 0;
    }
    if (idx >= 0) {
      used[idx] = true;
      matched++;
      weight += isFuzzy ? 0.85 : 1;
      fuzzy ||= isFuzzy;
      continue;
    }
    // A compound written as two words ("dish wash" for "dishwash"): a spelling variant, so fuzzy.
    const j = pool.findIndex(
      (p, i) =>
        !used[i] && !used[i + 1] && i + 1 < pool.length && p + (pool[i + 1] as string) === w,
    );
    if (j >= 0) {
      used[j] = true;
      used[j + 1] = true;
      matched++;
      weight += 0.85;
      fuzzy = true;
    }
  }
  return { matched, weight, fuzzy };
}

function evaluate(l: Prepared, c: CandidateProduct): Evaluation {
  const candSize = normalizeUnit(c.quantityValue, c.quantityUnit);
  if (l.size && !sameQuantity(l.size, candSize)) return rejected('size differs');
  const sizeKnown = l.size !== null;

  // brand
  const candBrandTokens = wordsOf(c.brand);
  const candBrandKey = candBrandTokens.join('');
  let tokens = l.tokens;
  let brand: 'equal' | 'different' | 'unknown';
  if (l.brandKey) {
    brand = l.brandKey === candBrandKey ? 'equal' : 'different';
    tokens = removeSequence(tokens, brand === 'equal' ? candBrandTokens : l.brandTokens).tokens;
  } else {
    const r = removeSequence(tokens, candBrandTokens);
    brand = r.found ? 'equal' : 'unknown';
    tokens = r.tokens;
  }

  // name and variant
  const pool = tokens.map(canon);
  const used = pool.map(() => false);
  const nameWords = wordsOf(c.name).map(canon);
  const variantWords = wordsOf(c.variant ?? '').map(canon);
  const name = consume(nameWords, pool, used);
  const variant = consume(variantWords, pool, used);
  const extras = pool.filter((_, i) => !used[i]);

  if (extras.some((t) => DIFFERENTIATING.has(t)))
    return rejected('has a word that makes it a different product');
  if (name.matched === 0) return rejected('product name not found');
  const nameFraction = name.matched / nameWords.length;
  if (nameFraction < 1 && extras.length > 0)
    return rejected('name only partly matches and has unexplained words');
  const variantFull = variant.matched === variantWords.length;
  if (!variantFull && extras.length > 0) return rejected('variant conflicts');

  const fuzzy = name.fuzzy || variant.fuzzy;
  const clean = nameFraction === 1 && !fuzzy && variantFull && extras.length === 0;

  if (clean && sizeKnown && brand === 'equal') {
    return {
      ok: true,
      status: 'EXACT',
      confidence: 1,
      reasons: ['brand, variant and size all equal'],
    };
  }
  if (brand === 'different') {
    if (clean && sizeKnown) {
      return {
        ok: true,
        status: 'SUBSTITUTE',
        confidence: SUBSTITUTE_CONFIDENCE,
        reasons: ['same item and size, different brand'],
      };
    }
    return rejected('different brand and not an otherwise identical item');
  }

  // LIKELY: plausible but something cannot be confirmed.
  const nameScore = name.weight / nameWords.length;
  const variantScore = variantWords.length === 0 ? 1 : variant.weight / variantWords.length;
  const sizeScore = sizeKnown ? 1 : 0.4;
  const brandScore = brand === 'equal' ? 1 : 0.4;
  const penalty = Math.min(0.1 * extras.length, 0.3);
  const raw = 0.3 * nameScore + 0.2 * variantScore + 0.25 * sizeScore + 0.25 * brandScore - penalty;
  const confidence = round2(Math.min(raw, LIKELY_MAX_CONFIDENCE));
  if (confidence < LIKELY_MIN_CONFIDENCE) return rejected('confidence too low');

  const why: string[] = [];
  if (fuzzy) why.push('spelling is only close');
  if (nameFraction < 1) why.push('name only partly matches');
  if (!variantFull) why.push('variant not stated');
  if (!sizeKnown) why.push('size not stated');
  if (brand === 'unknown') why.push('brand not stated');
  if (extras.length > 0) why.push(`extra words: ${extras.join(', ')}`);
  return { ok: true, status: 'LIKELY', confidence, reasons: why };
}

// ---- public API -----------------------------------------------------------------

const TIER: Record<'EXACT' | 'LIKELY' | 'SUBSTITUTE', number> = {
  EXACT: 3,
  LIKELY: 2,
  SUBSTITUTE: 1,
};

const unmatched = (reasons: string[], candidates: MatchCandidateInfo[] = []): MatchResult => ({
  matchStatus: 'UNMATCHED',
  matchConfidence: null,
  canonicalProductId: null,
  reasons,
  candidates,
});

export function matchListing(listing: ListingInput, candidates: CandidateProduct[]): MatchResult {
  const parsed = parseProductTitle(listing.title ?? '');
  const pack = listing.packSize ? parseProductTitle(listing.packSize) : null;
  const brandTokens = listing.brand ? wordsOf(listing.brand) : [];
  const prepared: Prepared = {
    tokens: parsed.tokens,
    size: parsed.size ?? pack?.size ?? null,
    brandTokens,
    brandKey: brandTokens.length > 0 ? brandTokens.join('') : null,
  };
  const packCount = Math.max(parsed.packCount, pack?.packCount ?? 1);
  const gtin = normGtin(listing.gtin);

  // 1. GTIN first
  if (gtin) {
    const hits = candidates.filter((c) => normGtin(c.gtin) === gtin);
    if (hits.length > 1) return unmatched(['gtin matches more than one catalogue item']);
    const hit = hits[0];
    if (hit) {
      const hitSize = normalizeUnit(hit.quantityValue, hit.quantityUnit);
      if (packCount > 1) return unmatched(['gtin conflict: the title describes a multipack']);
      if (prepared.size && !sameQuantity(prepared.size, hitSize))
        return unmatched(['gtin conflict: the size in the title differs from the barcode item']);
      const pool = prepared.tokens.map(canon);
      const nameWords = wordsOf(hit.name).map(canon);
      if (pool.length > 0 && !nameWords.some((w) => pool.includes(w)))
        return unmatched(['gtin conflict: the title names a different product']);
      return {
        matchStatus: 'EXACT',
        matchConfidence: 1,
        canonicalProductId: hit.id,
        reasons: ['gtin match'],
        candidates: [{ id: hit.id, matchStatus: 'EXACT', confidence: 1 }],
      };
    }
  }

  // 2. conditions that rule everything out
  if (!normalizeText(listing.title ?? '')) return unmatched(['empty title']);
  if (parsed.size && pack?.size && !sameQuantity(parsed.size, pack.size))
    return unmatched(['size conflict between the title and packSize']);
  if (packCount > 1) return unmatched(['multipack or bundle: not the same as a single pack']);

  // 3. evaluate every candidate; a different barcode means a different product
  const evaluated: { id: string; e: Extract<Evaluation, { ok: true }> }[] = [];
  for (const c of candidates) {
    if (gtin && normGtin(c.gtin)) continue;
    const e = evaluate(prepared, c);
    if (e.ok) evaluated.push({ id: c.id, e });
  }
  if (evaluated.length === 0) return unmatched(['no catalogue item is a close enough match']);

  evaluated.sort(
    (a, b) =>
      TIER[b.e.status] - TIER[a.e.status] ||
      b.e.confidence - a.e.confidence ||
      a.id.localeCompare(b.id),
  );
  const infos: MatchCandidateInfo[] = evaluated
    .slice(0, 3)
    .map((x) => ({ id: x.id, matchStatus: x.e.status, confidence: x.e.confidence }));

  const [best, second] = evaluated as [
    (typeof evaluated)[number],
    (typeof evaluated)[number] | undefined,
  ];
  if (
    second &&
    second.e.status === best.e.status &&
    best.e.confidence - second.e.confidence < AMBIGUITY_MARGIN
  ) {
    return unmatched([`ambiguous: could be ${best.id} or ${second.id}`], infos);
  }
  return {
    matchStatus: best.e.status,
    matchConfidence: best.e.confidence,
    canonicalProductId: best.id,
    reasons: best.e.reasons,
    candidates: infos,
  };
}
