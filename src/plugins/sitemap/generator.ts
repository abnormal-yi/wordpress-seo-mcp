export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export function generateSitemapXml(urls: SitemapUrl[]): string {
  const urlElements = urls.map(u => {
    const parts = ['  <url>', `    <loc>${escapeXml(u.loc)}</loc>`];
    if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
    if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
    if (u.priority !== undefined) parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
    parts.push('  </url>');
    return parts.join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;
}

export function buildSitemapFromPosts(posts: Array<{ slug: string; status: string }>, baseUrl: string): SitemapUrl[] {
  return posts
    .filter(p => p.status === 'publish')
    .map(p => ({
      loc: `${baseUrl.replace(/\/+$/, '')}/${p.slug}`,
      lastmod: new Date().toISOString().split('T')[0],
      priority: 0.7,
      changefreq: 'weekly',
    }));
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
