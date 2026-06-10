import { SeoAnalysisResult, SeoIssue } from '../../types/seo.js';

export function analyzeImages(html: string): SeoAnalysisResult {
  const issues: SeoIssue[] = [];
  const imgRegex = /<img[^>]+>/gi;
  const images = [...html.matchAll(imgRegex)].map(m => m[0]);

  let missingAlt = 0;
  let withAlt = 0;
  let missingLazy = 0;

  for (const img of images) {
    const altMatch = img.match(/alt=(["'])(.*?)\1/i);
    const hasAlt = altMatch !== null;
    const altContent = altMatch ? altMatch[2] : '';
    const hasLazy = /loading=["']lazy["']/i.test(img);

    if (!hasAlt || !altContent.trim()) missingAlt++;
    else withAlt++;
    if (!hasLazy) missingLazy++;
  }

  if (missingAlt > 0) issues.push({ severity: 'medium', message: `${missingAlt} image(s) missing alt text`, fixable: true, fixId: 'missing-alt' });
  if (missingLazy > 0) issues.push({ severity: 'low', message: `${missingLazy} image(s) without loading="lazy"`, fixable: true, fixId: 'missing-lazy' });

  const score = images.length === 0 ? 100 : Math.max(0, Math.round(
    ((withAlt / images.length) * 50) +
    ((1 - missingLazy / Math.max(1, images.length)) * 50)
  ));

  return {
    pluginId: 'images',
    score,
    issues,
    metrics: { totalImages: images.length, imagesWithAlt: withAlt, imagesWithoutLazy: missingLazy },
  };
}
