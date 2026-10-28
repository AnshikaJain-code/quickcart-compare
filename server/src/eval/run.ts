/** CLI: `npm run eval:matching`. Prints precision and recall, writes docs/evaluation.md. */
import path from 'node:path';
import { MATCHING_SET } from '../tests/fixtures/matchingSet';
import { upsertSection } from './docSections';
import { evaluateMatching, renderEvaluationMarkdown, STATUSES } from './matchingEval';

const GATE = 0.95;
const result = evaluateMatching(MATCHING_SET);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
console.log(`Matching evaluation: ${result.total} labelled pairs\n`);
console.log('class        labelled  predicted  precision  recall');
for (const s of STATUSES) {
  const c = result.perClass[s];
  console.log(
    `${s.padEnd(12)} ${String(c.labelled).padStart(8)}  ${String(c.predicted).padStart(9)}  ${pct(c.precision).padStart(9)}  ${pct(c.recall).padStart(6)}`,
  );
}
console.log(`\nEXACT precision : ${pct(result.exact.precision)} (gate ${pct(GATE)})`);
console.log(`EXACT recall    : ${pct(result.exact.recall)}`);
console.log(`Wrong EXACTs    : ${result.falseExact.length}`);
console.log(`Accuracy        : ${pct(result.accuracy)} (${result.correct}/${result.total})`);
if (result.mismatches.length > 0) {
  console.log('\nDisagreements:');
  for (const r of result.mismatches) {
    console.log(
      `  ${r.id} "${r.title}": label ${r.expected}${r.expectedKey ? `(${r.expectedKey})` : ''}, got ${r.predicted}${r.predictedKey ? `(${r.predictedKey})` : ''}. ${r.reasons.join('; ')}`,
    );
  }
}

// server/src/eval -> repo root docs/
const out = path.resolve(__dirname, '../../../docs/evaluation.md');
upsertSection(out, 'matching', renderEvaluationMarkdown(result));
console.log(`\nWrote ${path.relative(process.cwd(), out) || out}`);

if (result.exact.precision < GATE) {
  console.error(`\nFAIL: EXACT precision is below ${pct(GATE)}. Fix the rules, not the labels.`);
  process.exitCode = 1;
}
