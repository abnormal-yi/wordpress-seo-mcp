import { SeoAnalysisResult, SeoIssue } from '../../types/seo.js';
import { WpPost } from '../../types/wordpress.js';

export function analyzeMeta(post: WpPost): SeoAnalysisResult {
  const issues: SeoIssue[] = [];
  const meta = post.yoast_head_json ?? {};

  const title = meta.title ?? '';
  const description = meta.description ?? '';
  const ogTitle = meta.og_title ?? '';
  const twitterTitle = meta.twitter_title ?? '';

  if (!title) issues.push({ severity: 'critical', message: 'Meta title is missing', fixable: true, fixId: 'missing-title' });
  else if (title.length < 30) issues.push({ severity: 'high', message: `Meta title too short (${title.length} chars, need 30-60)`, fixable: true, fixId: 'title-too-short' });
  else if (title.length > 60) issues.push({ severity: 'medium', message: `Meta title too long (${title.length} chars, max 60)`, fixable: true, fixId: 'title-too-long' });

  if (!description) issues.push({ severity: 'critical', message: 'Meta description is missing', fixable: true, fixId: 'missing-desc' });
  else if (description.length < 50) issues.push({ severity: 'high', message: `Meta description too short (${description.length} chars, need 50-160)`, fixable: true, fixId: 'desc-too-short' });
  else if (description.length > 160) issues.push({ severity: 'medium', message: `Meta description too long (${description.length} chars, max 160)`, fixable: true, fixId: 'desc-too-long' });

  if (!ogTitle) issues.push({ severity: 'low', message: 'Open Graph title missing', fixable: true, fixId: 'missing-og-title' });
  if (!twitterTitle) issues.push({ severity: 'low', message: 'Twitter card title missing', fixable: true, fixId: 'missing-twitter-title' });

  const score = Math.max(0, 100 - issues.reduce((s, i) => {
    const weights: Record<string, number> = { critical: 25, high: 15, medium: 10, low: 5, info: 0 };
    return s + (weights[i.severity] ?? 0);
  }, 0));

  return { pluginId: 'meta', score, issues, metrics: { titleLength: title.length, descriptionLength: description.length } };
}
