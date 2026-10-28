import { describe, expect, it } from 'vitest';
import { evaluateMatching, renderEvaluationMarkdown } from '../eval/matchingEval';
import { MATCHING_SET } from './fixtures/matchingSet';

describe('labelled matching set', () => {
  it('has at least 60 pairs with unique ids and consistent labels', () => {
    expect(MATCHING_SET.length).toBeGreaterThanOrEqual(60);
    expect(new Set(MATCHING_SET.map((p) => p.id)).size).toBe(MATCHING_SET.length);
    for (const p of MATCHING_SET) {
      expect(p.expected === 'UNMATCHED').toBe(p.expectedKey === null);
    }
    const counts = new Set(MATCHING_SET.map((p) => p.expected));
    expect([...counts].sort()).toEqual(['EXACT', 'LIKELY', 'SUBSTITUTE', 'UNMATCHED']);
  });
});

describe('matcher quality gate', () => {
  const result = evaluateMatching(MATCHING_SET);

  it('EXACT precision is at least 95% (what we auto-confirm must be right)', () => {
    expect(result.exact.precision).toBeGreaterThanOrEqual(0.95);
  });
  it('never auto-confirms a wrong product as EXACT', () => {
    expect(result.falseExact).toEqual([]);
  });
  it('reports precision and recall for every class and overall accuracy', () => {
    for (const s of ['EXACT', 'LIKELY', 'SUBSTITUTE', 'UNMATCHED'] as const) {
      expect(result.perClass[s].precision).toBeGreaterThanOrEqual(0);
      expect(result.perClass[s].recall).toBeGreaterThanOrEqual(0);
    }
    expect(result.accuracy).toBeGreaterThan(0.9);
    expect(result.total).toBe(MATCHING_SET.length);
  });
  it('renders a markdown report with the headline numbers', () => {
    const md = renderEvaluationMarkdown(result);
    expect(md).toContain('# Matching evaluation');
    expect(md).toContain('EXACT precision');
    expect(md).toContain('Confusion matrix');
  });
});
