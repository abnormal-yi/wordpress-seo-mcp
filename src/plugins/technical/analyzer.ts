import { SeoAnalysisResult, SeoIssue } from '../../types/seo.js';

export function analyzeTechnical(html: string, statusCode: number): SeoAnalysisResult {
  const issues: SeoIssue[] = [];
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';

  const canonical = head.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  if (!canonical) issues.push({ severity: 'high', message: 'No canonical URL found', fixable: true, fixId: 'missing-canonical' });

  const robots = head.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (robots) {
    const content = robots[1].toLowerCase();
    if (content.includes('noindex')) issues.push({ severity: 'high', message: 'Page is set to noindex', fixable: true, fixId: 'noindex-set' });
    if (content.includes('nofollow')) issues.push({ severity: 'medium', message: 'Page is set to nofollow', fixable: true, fixId: 'nofollow-set' });
  }

  const hreflangTags = [...head.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]*>/gi)];
  if (hreflangTags.length > 0) {
    issues.push({ severity: 'info', message: `${hreflangTags.length} hreflang tag(s) found`, fixable: false, fixId: '' });
  }

  if (statusCode >= 301 && statusCode <= 308) {
    issues.push({ severity: 'info', message: `Page returns ${statusCode} redirect`, fixable: false, fixId: '' });
  }

  const score = Math.max(0, 100 - issues.reduce((s, i) => {
    const weights: Record<string, number> = { critical: 25, high: 15, medium: 10, low: 5, info: 0 };
    return s + (weights[i.severity] ?? 0);
  }, 0));

  return {
    pluginId: 'technical',
    score,
    issues,
    metrics: { statusCode, hreflangCount: hreflangTags.length, hasCanonical: !!canonical },
  };
}
