import { describe, it, expect } from 'vitest';
import { analyzeTechnical } from '../../src/plugins/technical/analyzer.js';

describe('Technical Analyzer', () => {
  it('reports missing canonical', () => {
    const r = analyzeTechnical('<html><head></head></html>', 200);
    expect(r.issues.some(i => i.fixId === 'missing-canonical')).toBe(true);
  });

  it('detects existing canonical', () => {
    const r = analyzeTechnical('<html><head><link rel="canonical" href="https://example.com/page"></head></html>', 200);
    expect(r.issues.some(i => i.fixId === 'missing-canonical')).toBe(false);
  });

  it('detects noindex', () => {
    const r = analyzeTechnical('<html><head><meta name="robots" content="noindex"></head></html>', 200);
    expect(r.issues.some(i => i.fixId === 'noindex-set')).toBe(true);
  });

  it('detects nofollow', () => {
    const r = analyzeTechnical('<html><head><meta name="robots" content="nofollow"></head></html>', 200);
    expect(r.issues.some(i => i.fixId === 'nofollow-set')).toBe(true);
  });

  it('detects hreflang tags', () => {
    const r = analyzeTechnical('<html><head><link rel="alternate" hreflang="en" href="https://example.com/en"></head></html>', 200);
    expect(r.metrics.hreflangCount).toBe(1);
  });

  it('detects redirect status', () => {
    const r = analyzeTechnical('<html></html>', 301);
    expect(r.issues.some(i => i.message.includes('301'))).toBe(true);
  });

  it('returns correct pluginId', () => {
    const r = analyzeTechnical('<html><head><link rel="canonical" href="https://example.com"></head></html>', 200);
    expect(r.pluginId).toBe('technical');
  });

  it('handles empty head', () => {
    const r = analyzeTechnical('<html><body>No head</body></html>', 200);
    expect(r.issues.some(i => i.fixId === 'missing-canonical')).toBe(true);
  });
});
