import { describe, it, expect } from 'vitest';
import { analyzeContent } from '../../src/plugins/content/analyzer.js';

describe('Content Analyzer', () => {
  it('reports missing H1', () => {
    const r = analyzeContent('<p>No headings</p>');
    expect(r.issues.some(i => i.fixId === 'missing-h1')).toBe(true);
  });

  it('detects H1 when present', () => {
    const r = analyzeContent('<h1>Title</h1><p>Content</p>');
    expect(r.issues.some(i => i.fixId === 'missing-h1')).toBe(false);
  });

  it('reports heading level skip', () => {
    const r = analyzeContent('<h1>Title</h1><h3>Skipped H2</h3>');
    expect(r.issues.some(i => i.fixId === 'heading-skip')).toBe(true);
  });

  it('accepts proper heading hierarchy', () => {
    const r = analyzeContent('<h1>Title</h1><h2>Sub</h2><h3>Detail</h3>');
    expect(r.issues.some(i => i.fixId === 'heading-skip')).toBe(false);
  });

  it('reports short content', () => {
    const r = analyzeContent('<p>Short</p>');
    expect(r.issues.some(i => i.fixId === 'content-too-short')).toBe(true);
  });

  it('checks keyword in headings', () => {
    const r = analyzeContent('<h1>About Us</h1><p>We do stuff</p>', 'seo');
    expect(r.issues.some(i => i.fixId === 'keyword-not-in-headings')).toBe(true);
  });

  it('checks keyword in body', () => {
    const r = analyzeContent('<h1>Title</h1><p>We do seo stuff here</p>', 'seo');
    expect(r.issues.some(i => i.fixId === 'keyword-not-in-content')).toBe(false);
  });

  it('returns correct pluginId', () => {
    const r = analyzeContent('<h1>Title</h1><p>Content here</p>');
    expect(r.pluginId).toBe('content');
  });

  it('provides word count metric', () => {
    const words = Array(400).fill('word').join(' ');
    const r = analyzeContent(`<h1>Title</h1><p>${words}</p>`);
    expect(r.metrics.wordCount).toBeGreaterThanOrEqual(400);
    expect(r.issues.some(i => i.fixId === 'content-too-short')).toBe(false);
  });
});
