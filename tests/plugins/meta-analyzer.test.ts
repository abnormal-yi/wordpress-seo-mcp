import { describe, it, expect } from 'vitest';
import { analyzeMeta } from '../../src/plugins/meta/analyzer.js';

describe('Meta Analyzer', () => {
  it('flags missing title as critical', () => {
    const r = analyzeMeta({ yoast_head_json: {} } as any);
    expect(r.issues.some(i => i.fixId === 'missing-title' && i.severity === 'critical')).toBe(true);
  });

  it('flags short title', () => {
    const r = analyzeMeta({ yoast_head_json: { title: 'Hi' } } as any);
    expect(r.issues.some(i => i.fixId === 'title-too-short')).toBe(true);
  });

  it('flags long title', () => {
    const r = analyzeMeta({ yoast_head_json: { title: 'A'.repeat(70) } } as any);
    expect(r.issues.some(i => i.fixId === 'title-too-long')).toBe(true);
  });

  it('flags missing description', () => {
    const r = analyzeMeta({ yoast_head_json: { title: 'Good title here for test' } } as any);
    expect(r.issues.some(i => i.fixId === 'missing-desc')).toBe(true);
  });

  it('flags short description', () => {
    const r = analyzeMeta({ yoast_head_json: { title: 'Good', description: 'Short' } } as any);
    expect(r.issues.some(i => i.fixId === 'desc-too-short')).toBe(true);
  });

  it('flags long description', () => {
    const r = analyzeMeta({ yoast_head_json: { title: 'Good', description: 'A'.repeat(200) } } as any);
    expect(r.issues.some(i => i.fixId === 'desc-too-long')).toBe(true);
  });

  it('flags missing OG and Twitter titles', () => {
    const r = analyzeMeta({ yoast_head_json: { title: 'Perfect title length here now', description: 'A proper description length here that is long enough for the test case' } } as any);
    expect(r.issues.some(i => i.fixId === 'missing-og-title')).toBe(true);
    expect(r.issues.some(i => i.fixId === 'missing-twitter-title')).toBe(true);
  });

  it('returns high score for good meta', () => {
    const r = analyzeMeta({
      yoast_head_json: {
        title: 'Perfect Title Length Here Now For',
        description: 'A proper description that is between 50 and 160 chars and is good enough for test',
        og_title: 'OG Title',
        twitter_title: 'Twitter Title',
      },
    } as any);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.pluginId).toBe('meta');
  });

  it('handles empty yoast_head_json', () => {
    const r = analyzeMeta({} as any);
    expect(r.issues.length).toBeGreaterThanOrEqual(4);
  });
});
