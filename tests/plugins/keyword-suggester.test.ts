import { describe, it, expect } from 'vitest';
import { suggestKeywords } from '../../src/plugins/keyword/suggester.js';

describe('Keyword Suggester', () => {
  it('generates keyword variations with modifiers', () => {
    const r = suggestKeywords('SEO tools');
    expect(r.keywords.length).toBeGreaterThan(0);
    expect(r.keywords.some(k => k.includes('best'))).toBe(true);
  });

  it('generates question-based keywords', () => {
    const r = suggestKeywords('WordPress SEO');
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.some(q => q.startsWith('what') || q.startsWith('how'))).toBe(true);
  });

  it('generates related terms', () => {
    const r = suggestKeywords('content marketing');
    expect(r.related.some(t => t.includes('guide'))).toBe(true);
    expect(r.related.some(t => t.includes('tips'))).toBe(true);
  });

  it('handles single word topics', () => {
    const r = suggestKeywords('SEO');
    expect(r.keywords.length).toBeGreaterThan(5);
  });
});
