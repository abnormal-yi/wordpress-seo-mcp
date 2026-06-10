import { describe, it, expect } from 'vitest';
import { generateSitemapXml, buildSitemapFromPosts } from '../../src/plugins/sitemap/generator.js';

describe('Sitemap Generator', () => {
  it('generates valid XML with proper namespace', () => {
    const xml = generateSitemapXml([{ loc: 'https://example.com/page', lastmod: '2024-01-01', priority: 0.8 }]);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('<loc>https://example.com/page</loc>');
    expect(xml).toContain('<priority>0.8</priority>');
  });

  it('handles multiple URLs', () => {
    const urls = [
      { loc: 'https://example.com/a', lastmod: '2024-01-01' },
      { loc: 'https://example.com/b', lastmod: '2024-01-02' },
    ];
    const xml = generateSitemapXml(urls);
    const matches = xml.match(/<loc>/g);
    expect(matches).toHaveLength(2);
  });

  it('escapes XML special chars in URLs', () => {
    const xml = generateSitemapXml([{ loc: 'https://example.com/page?q=1&x=2' }]);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('&x=2');
  });
});

describe('buildSitemapFromPosts', () => {
  it('only includes published posts', () => {
    const posts = [
      { slug: 'post-1', status: 'publish' },
      { slug: 'draft-1', status: 'draft' },
    ];
    const urls = buildSitemapFromPosts(posts, 'https://mysite.com');
    expect(urls).toHaveLength(1);
    expect(urls[0].loc).toContain('post-1');
  });

  it('generates weekly frequency by default', () => {
    const urls = buildSitemapFromPosts([{ slug: 'hello', status: 'publish' }], 'https://mysite.com');
    expect(urls[0].changefreq).toBe('weekly');
  });

  it('strips trailing slash from base URL', () => {
    const urls = buildSitemapFromPosts([{ slug: 'hello', status: 'publish' }], 'https://mysite.com/');
    expect(urls[0].loc).toBe('https://mysite.com/hello');
  });
});
