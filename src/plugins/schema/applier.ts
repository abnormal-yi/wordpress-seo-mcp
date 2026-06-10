import { WpPost } from '../../types/wordpress.js';
import { SeoFixResult } from '../../types/seo.js';

export function generateArticleSchema(post: WpPost, siteName: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title.rendered,
    description: (post.excerpt?.rendered ?? '').replace(/<[^>]*>/g, '').trim(),
    datePublished: new Date().toISOString(),
    author: { '@type': 'Person', name: 'Author' },
    publisher: { '@type': 'Organization', name: siteName },
  };
}

export function generateOrganizationSchema(siteName: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
  };
}

export function generateBreadcrumbSchema(post: WpPost, siteUrl: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: post.title.rendered, item: `${siteUrl}/${post.slug}` },
    ],
  };
}

export function applySchemaFix(post: WpPost, fixId: string, siteConfig: { name: string; url: string }): { changes: string[]; schema: object } {
  switch (fixId) {
    case 'missing-article-schema':
      return { changes: ['Added Article JSON-LD schema'], schema: generateArticleSchema(post, siteConfig.name) };
    case 'missing-org-schema':
      return { changes: ['Added Organization JSON-LD schema'], schema: generateOrganizationSchema(siteConfig.name) };
    case 'missing-breadcrumb-schema':
      return { changes: ['Added BreadcrumbList JSON-LD schema'], schema: generateBreadcrumbSchema(post, siteConfig.url) };
    default:
      throw new Error(`Unknown schema fix: ${fixId}`);
  }
}

export function injectSchemaIntoContent(content: string, schemas: object[]): string {
  const schemaHtml = `<script type="application/ld+json">${JSON.stringify(schemas.length === 1 ? schemas[0] : { '@context': 'https://schema.org', '@graph': schemas })}</script>`;

  if (content.includes('</head>')) {
    return content.replace('</head>', `${schemaHtml}\n</head>`);
  }
  return schemaHtml + '\n' + content;
}
