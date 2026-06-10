import { describe, it, expect } from 'vitest';
import { generateArticleSchema, generateOrganizationSchema, generateBreadcrumbSchema, injectSchemaIntoContent } from '../../src/plugins/schema/applier.js';

function makePost(title: string, slug: string, excerpt?: string) {
  return { title: { rendered: title }, slug, excerpt: { rendered: excerpt ?? '' } } as any;
}

describe('Schema Applier', () => {
  it('generates valid Article schema', () => {
    const s = generateArticleSchema(makePost('My Article', 'my-article', 'An excerpt'), 'MySite');
    expect(s['@type']).toBe('Article');
    expect(s.headline).toBe('My Article');
    expect(s.publisher.name).toBe('MySite');
  });

  it('generates Organization schema', () => {
    const s = generateOrganizationSchema('MySite');
    expect(s['@type']).toBe('Organization');
    expect(s.name).toBe('MySite');
  });

  it('generates BreadcrumbList schema', () => {
    const s = generateBreadcrumbSchema(makePost('Page Title', 'page-slug'), 'https://mysite.com');
    expect(s['@type']).toBe('BreadcrumbList');
    expect(s.itemListElement).toHaveLength(2);
    expect(s.itemListElement[0].name).toBe('Home');
    expect(s.itemListElement[1].name).toBe('Page Title');
  });

  it('injects schema into head', () => {
    const html = '<html><head></head><body></body></html>';
    const result = injectSchemaIntoContent(html, [{ '@type': 'Article' }]);
    expect(result).toContain('application/ld+json');
    expect(result.indexOf('application/ld+json')).toBeLessThan(result.indexOf('</head>'));
  });

  it('injects schema before content when no head', () => {
    const html = '<body>Hello</body>';
    const result = injectSchemaIntoContent(html, [{ '@type': 'Article' }]);
    expect(result.startsWith('<script')).toBe(true);
  });

  it('creates @graph for multiple schemas', () => {
    const s = injectSchemaIntoContent('<html><head></head></html>', [
      { '@type': 'Article' },
      { '@type': 'Organization' },
    ]);
    expect(s).toContain('@graph');
  });
});
