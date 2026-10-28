/**
 * Evaluation of the matcher against a labelled set. Pure (no I/O); run.ts does the printing and writing.
 *
 * A prediction counts as correct for a class only if BOTH the status and (for mapped statuses) the
 * canonical product are right. Precision/recall are defined per class:
 *   precision = correct predictions of the class / all predictions of the class
 *   recall    = correct predictions of the class / all labelled pairs of the class
 * A class with no predictions (or no labels) has precision (recall) 1 by convention.
 * The headline safety metric is EXACT precision: of everything we would auto-confirm, how much is right.
 */
import type { MatchStatus } from '../models/enums';
import { PRODUCTS } from '../seed/data';
import { matchListing, type CandidateProduct } from '../services/matching';
import type { LabelledPair } from '../tests/fixtures/matchingSet';

export const STATUSES: MatchStatus[] = ['EXACT', 'LIKELY', 'SUBSTITUTE', 'UNMATCHED'];

export function defaultCatalogue(): CandidateProduct[] {
  return PRODUCTS.map((p) => ({
    id: p.key,
    name: p.name,
    brand: p.brand,
    variant: p.variant,
    quantityValue: p.qty,
    quantityUnit: p.unit,
    gtin: p.gtin ?? null,
  }));
}

export interface EvalRow {
  id: string;
  title: string;
  expected: MatchStatus;
  expectedKey: string | null;
  predicted: MatchStatus;
  predictedKey: string | null;
  confidence: number | null;
  reasons: string[];
  correct: boolean;
}

export interface ClassStats {
  labelled: number;
  predicted: number;
  correct: number;
  precision: number;
  recall: number;
}

export interface EvalResult {
  total: number;
  correct: number;
  accuracy: number;
  perClass: Record<MatchStatus, ClassStats>;
  exact: { precision: number; recall: number };
  /** Predicted EXACT but wrong. Must be empty. */
  falseExact: EvalRow[];
  mismatches: EvalRow[];
  confusion: Record<MatchStatus, Record<MatchStatus, number>>;
  rows: EvalRow[];
}

const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

export function evaluateMatching(
  set: LabelledPair[],
  catalogue: CandidateProduct[] = defaultCatalogue(),
): EvalResult {
  const rows: EvalRow[] = set.map((p) => {
    const r = matchListing(
      { title: p.title, brand: p.brand, packSize: p.packSize, gtin: p.gtin },
      catalogue,
    );
    const correct = r.matchStatus === p.expected && r.canonicalProductId === p.expectedKey;
    return {
      id: p.id,
      title: p.title,
      expected: p.expected,
      expectedKey: p.expectedKey,
      predicted: r.matchStatus,
      predictedKey: r.canonicalProductId,
      confidence: r.matchConfidence,
      reasons: r.reasons,
      correct,
    };
  });

  const confusion = Object.fromEntries(
    STATUSES.map((e) => [e, Object.fromEntries(STATUSES.map((p) => [p, 0]))]),
  ) as Record<MatchStatus, Record<MatchStatus, number>>;
  for (const r of rows) confusion[r.expected][r.predicted]++;

  const perClass = Object.fromEntries(
    STATUSES.map((s) => {
      const labelled = rows.filter((r) => r.expected === s).length;
      const predicted = rows.filter((r) => r.predicted === s).length;
      const correct = rows.filter((r) => r.predicted === s && r.correct).length;
      return [
        s,
        {
          labelled,
          predicted,
          correct,
          precision: ratio(correct, predicted),
          recall: ratio(correct, labelled),
        },
      ];
    }),
  ) as Record<MatchStatus, ClassStats>;

  const correct = rows.filter((r) => r.correct).length;
  return {
    total: rows.length,
    correct,
    accuracy: ratio(correct, rows.length),
    perClass,
    exact: { precision: perClass.EXACT.precision, recall: perClass.EXACT.recall },
    falseExact: rows.filter((r) => r.predicted === 'EXACT' && !r.correct),
    mismatches: rows.filter((r) => !r.correct),
    confusion,
    rows,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function renderEvaluationMarkdown(res: EvalResult): string {
  const lines: string[] = [];
  lines.push('## Matching evaluation', '');

  lines.push('### Result', '');
  lines.push('| Metric | Value |', '| --- | --- |');
  lines.push(`| Labelled pairs | ${res.total} |`);
  lines.push(`| **EXACT precision** (gate: at least 95%) | **${pct(res.exact.precision)}** |`);
  lines.push(`| EXACT recall | ${pct(res.exact.recall)} |`);
  lines.push(`| Wrong EXACT predictions | ${res.falseExact.length} |`);
  lines.push(
    `| Overall accuracy (status and product both right) | ${pct(res.accuracy)} (${res.correct} of ${res.total}) |`,
    '',
  );

  lines.push('### Per class', '');
  lines.push(
    '| Class | Labelled | Predicted | Correct | Precision | Recall |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const s of STATUSES) {
    const c = res.perClass[s];
    lines.push(
      `| ${s} | ${c.labelled} | ${c.predicted} | ${c.correct} | ${pct(c.precision)} | ${pct(c.recall)} |`,
    );
  }

  lines.push(
    '',
    '### Confusion matrix',
    '',
    'Rows are the label, columns are what the matcher said.',
    '',
  );
  lines.push(
    `| label \\ predicted | ${STATUSES.join(' | ')} |`,
    `| --- | ${STATUSES.map(() => '---:').join(' | ')} |`,
  );
  for (const e of STATUSES)
    lines.push(`| ${e} | ${STATUSES.map((p) => res.confusion[e][p]).join(' | ')} |`);

  lines.push('', '### Disagreements', '');
  if (res.mismatches.length === 0) {
    lines.push('None: every pair got the labelled status and product.');
  } else {
    lines.push('| Id | Title | Label | Matcher | Why |', '| --- | --- | --- | --- | --- |');
    for (const r of res.mismatches) {
      const exp = r.expectedKey ? `${r.expected} (${r.expectedKey})` : r.expected;
      const got = r.predictedKey ? `${r.predicted} (${r.predictedKey})` : r.predicted;
      lines.push(
        `| ${r.id} | ${r.title.replace(/\|/g, '\\|')} | ${exp} | ${got} | ${r.reasons.join('; ').replace(/\|/g, '\\|')} |`,
      );
    }
  }

  lines.push('', '### How the matcher decides', '');
  lines.push(
    '1. **Barcode first.** A GTIN that matches a catalogue item is EXACT unless the title contradicts it (different size, a bundle, or a different product name), in which case the pair is UNMATCHED.',
    '2. **Size is a hard gate.** Sizes are normalised to ml, g or pcs (0.5 L = 500 ml). A different size, or a different unit family, rules a candidate out. Bundles ("2 x 500 ml") are never matched to a single pack.',
    '3. **EXACT** needs brand, variant, name and size all confirmed, with no unexplained words and no spelling fixes.',
    '4. **Anything uncertain is at most LIKELY** (confidence 0.5 to 0.95, never 1): brand, variant or size not stated; an extra word; a one-letter typo; a shortened name.',
    '5. **A different brand** of an otherwise identical item and size is SUBSTITUTE (confidence 0.6). It is only used in a comparison if the shopper opts in.',
    '6. **Different-product words** (diet, decaf, organic, flavours, low fat and similar) rule a candidate out.',
    '7. **Ties are not guessed.** If two candidates are equally good the result is UNMATCHED and the candidates are listed for an admin.',
    '',
  );

  lines.push('### Limitations (read before trusting the numbers)', '');
  lines.push(
    '- The labelled set (see `server/src/tests/fixtures/matchingSet.ts`) was written by the same developer who wrote the matcher, from the product rules in `CLAUDE.md`, before the matcher was implemented. It is a regression and sanity set, not an independent benchmark.',
    '- The 34 pairs with ids starting `P` were added as adversarial probes after the matcher was implemented, labelled before being run. On their first run 33 of 34 were correct; the one miss (`P26`, "Dish Wash" written as two words) led to a rule fix, not a label change. The 96 `E`/`L`/`S`/`U` pairs were written before the matcher existed.',
    '- It is small and synthetic: titles follow the three styles used in the sample data plus hand-written look-alikes, against a 40-product catalogue. Real provider titles are messier, so expect lower accuracy on real data.',
    '- The matcher is rule-based and English only. It has no learning component, so adding labelled pairs changes nothing unless the rules are changed.',
    '- The safety property that matters is that wrong auto-confirmations are rare. Anything the matcher is unsure about is LIKELY or UNMATCHED and goes to an admin for review (Phase 6).',
    '',
  );
  return lines.join('\n');
}
