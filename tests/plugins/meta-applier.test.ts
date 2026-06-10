import { describe, it, expect } from 'vitest';
import { applyMetaFix } from '../../src/plugins/meta/applier.js';

function makePost(title: string, slug: string, excerpt: string, yoast?: any) {
  return {
    title: { rendered: title },
    slug,
    excerpt: { rendered: excerpt },
    yoast_head_json: yoast ?? {},
  } as any;
}

describe('Meta Applier', () => {
  it('generates title from post title when missing', () => {
    const r = applyMetaFix(makePost('My Post', 'my-post', ''), 'missing-title', 'MySite');
    expect(r.changes[0]).toContain('My Post');
    expect(r.updates.title).toBeTruthy();
  });

  it('truncates long titles to 55 chars', () => {
    const long = 'A'.repeat(100);
    const r = applyMetaFix(makePost('', '', '', { title: long }), 'title-too-long');
    expect(r.updates.title!.length).toBeLessThanOrEqual(58);
  });

  it('generates description from excerpt when missing', () => {
    const r = applyMetaFix(makePost('Test', 'test', 'This is my excerpt for testing purposes'), 'missing-desc');
    expect(r.updates.description).toContain('This is my excerpt');
  });

  it('truncates long description to 160 chars', () => {
    const long = 'A'.repeat(200);
    const r = applyMetaFix(makePost('Test', 'test', '', { description: long }), 'desc-too-long');
    expect(r.updates.description!.length).toBeLessThanOrEqual(160);
  });

  it('sets OG title from meta title', () => {
    const r = applyMetaFix(makePost('Test', 'test', '', { title: 'My Title' }), 'missing-og-title');
    expect(r.updates.og_title).toBe('My Title');
  });

  it('sets Twitter title from meta title', () => {
    const r = applyMetaFix(makePost('Test', 'test', '', { title: 'My Title' }), 'missing-twitter-title');
    expect(r.updates.twitter_title).toBe('My Title');
  });

  it('throws for unknown fixId', () => {
    expect(() => applyMetaFix(makePost('T', 't', ''), 'unknown-fix')).toThrow();
  });
});
