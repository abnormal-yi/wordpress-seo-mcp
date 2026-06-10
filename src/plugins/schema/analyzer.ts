import { SeoAnalysisResult, SeoIssue } from '../../types/seo.js';

export function analyzeSchema(html: string): SeoAnalysisResult {
  const issues: SeoIssue[] = [];
  const schemaRegex = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
  const matches = [...html.matchAll(schemaRegex)];
  const schemas = matches.map(m => {
    try { return JSON.parse(m[1]); } catch { return null; }
  }).filter(Boolean);

  const types = schemas.flatMap(s => {
    if (s['@graph']) return s['@graph'].map((g: any) => g['@type']);
    return [s['@type']];
  }).filter(Boolean);

  const hasArticle = types.includes('Article') || types.includes('BlogPosting') || types.includes('NewsArticle');
  const hasOrg = types.includes('Organization');
  const hasBreadcrumb = types.includes('BreadcrumbList');

  if (schemas.length === 0) issues.push({ severity: 'high', message: 'No JSON-LD schema found', fixable: true, fixId: 'missing-schema' });
  if (!hasArticle) issues.push({ severity: 'high', message: 'Missing Article/BlogPosting schema', fixable: true, fixId: 'missing-article-schema' });
  if (!hasOrg) issues.push({ severity: 'medium', message: 'Missing Organization schema', fixable: true, fixId: 'missing-org-schema' });
  if (!hasBreadcrumb) issues.push({ severity: 'low', message: 'Missing BreadcrumbList schema', fixable: true, fixId: 'missing-breadcrumb-schema' });

  const score = Math.max(0, 100 - issues.reduce((s, i) => {
    const weights: Record<string, number> = { critical: 25, high: 15, medium: 10, low: 5, info: 0 };
    return s + (weights[i.severity] ?? 0);
  }, 0));

  const allTypes = ['Article', 'Organization', 'BreadcrumbList'];
  return {
    pluginId: 'schema',
    score,
    issues,
    metrics: {
      foundTypes: types,
      suggestedTypes: allTypes.filter(t => !types.includes(t)),
      schemaCount: schemas.length,
    },
  };
}
