import { describe, it, expect } from 'vitest';
import { analyzeImages } from '../../src/plugins/images/analyzer.js';

describe('Image Analyzer', () => {
  it('reports images missing alt text', () => {
    const r = analyzeImages('<img src="a.jpg"><img src="b.jpg" alt="">');
    expect(r.issues.some(i => i.fixId === 'missing-alt')).toBe(true);
  });

  it('counts images with alt text', () => {
    const r = analyzeImages('<img src="a.jpg" alt="Good"><img src="b.jpg" alt="">');
    expect(r.metrics.imagesWithAlt).toBe(1);
    expect(r.metrics.totalImages).toBe(2);
  });

  it('reports missing lazy loading', () => {
    const r = analyzeImages('<img src="a.jpg" alt="Good">');
    expect(r.issues.some(i => i.fixId === 'missing-lazy')).toBe(true);
  });

  it('accepts images with lazy loading', () => {
    const r = analyzeImages('<img src="a.jpg" alt="Good" loading="lazy">');
    expect(r.issues.some(i => i.fixId === 'missing-lazy')).toBe(false);
  });

  it('returns perfect score when no images', () => {
    const r = analyzeImages('<p>No images</p>');
    expect(r.score).toBe(100);
  });

  it('returns pluginId correctly', () => {
    const r = analyzeImages('<img src="a.jpg">');
    expect(r.pluginId).toBe('images');
  });
});
