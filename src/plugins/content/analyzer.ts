import { SeoAnalysisResult, SeoIssue } from '../../types/seo.js';

export function analyzeContent(html: string, focusKeyword?: string): SeoAnalysisResult {
  const issues: SeoIssue[] = [];
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = text.split(/\s+/).length;

  const headings: Record<string, string[]> = {};
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = match[1];
    const content = match[2].replace(/<[^>]*>/g, '').trim();
    if (!headings[level]) headings[level] = [];
    headings[level].push(content);
  }

  if (!headings['1']) issues.push({ severity: 'high', message: 'No H1 heading found', fixable: true, fixId: 'missing-h1' });

  const levels = Object.keys(headings).map(Number).sort();
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      issues.push({ severity: 'medium', message: `Heading level jumps from H${levels[i-1]} to H${levels[i]}`, fixable: true, fixId: 'heading-skip' });
    }
  }

  if (wordCount < 300) issues.push({ severity: 'medium', message: `Content too short (${wordCount} words, aim for 300+)`, fixable: false, fixId: 'content-too-short' });

  if (focusKeyword) {
    const kwLower = focusKeyword.toLowerCase();
    const inHeadings = Object.values(headings).flat().some(h => h.toLowerCase().includes(kwLower));
    if (!inHeadings) issues.push({ severity: 'low', message: `Keyword "${focusKeyword}" not found in any heading`, fixable: true, fixId: 'keyword-not-in-headings' });
    const inBody = text.toLowerCase().includes(kwLower);
    if (!inBody) issues.push({ severity: 'high', message: `Keyword "${focusKeyword}" not found in body content`, fixable: true, fixId: 'keyword-not-in-content' });
  }

  const score = Math.max(0, 100 - issues.reduce((s, i) => {
    const weights: Record<string, number> = { critical: 25, high: 15, medium: 10, low: 5, info: 0 };
    return s + (weights[i.severity] ?? 0);
  }, 0));

  return {
    pluginId: 'content',
    score,
    issues,
    metrics: {
      wordCount,
      headingCount: Object.values(headings).flat().length,
      headingStructure: levels,
      hasH1: !!headings['1'],
    },
  };
}
