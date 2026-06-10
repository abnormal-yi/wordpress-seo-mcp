import { WpPost } from '../../types/wordpress.js';
import { SeoFixResult } from '../../types/seo.js';

export function applyMetaFix(post: WpPost, fixId: string, siteName?: string): { changes: string[]; updates: Record<string, string> } {
  const changes: string[] = [];
  const updates: Record<string, string> = {};
  const meta = post.yoast_head_json ?? {};

  switch (fixId) {
    case 'missing-title': {
      const title = post.title.rendered || post.slug || 'Untitled';
      const fullTitle = siteName ? `${title} - ${siteName}` : title;
      const newTitle = fullTitle.slice(0, 60);
      updates.title = newTitle;
      changes.push(`Set meta title to: ${newTitle}`);
      break;
    }
    case 'title-too-short': {
      const title = post.title.rendered || post.slug || '';
      const fullTitle = siteName ? `${title} - ${siteName}` : title;
      const newTitle = fullTitle.slice(0, 60);
      updates.title = newTitle;
      changes.push(`Updated meta title to: ${newTitle}`);
      break;
    }
    case 'title-too-long': {
      const truncated = (meta.title ?? '').slice(0, 55) + '...';
      updates.title = truncated;
      changes.push(`Truncated meta title to 55 chars`);
      break;
    }
    case 'missing-desc': {
      const desc = (post.excerpt?.rendered ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 160);
      updates.description = desc;
      changes.push(`Generated meta description from excerpt`);
      break;
    }
    case 'desc-too-short': {
      const desc = (post.excerpt?.rendered ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 160);
      updates.description = desc;
      changes.push(`Updated meta description from excerpt`);
      break;
    }
    case 'desc-too-long': {
      const truncated = (meta.description ?? '').slice(0, 157) + '...';
      updates.description = truncated;
      changes.push(`Truncated meta description to 160 chars`);
      break;
    }
    case 'missing-og-title': {
      updates.og_title = meta.title || '';
      changes.push('Set OG title from meta title');
      break;
    }
    case 'missing-twitter-title': {
      updates.twitter_title = meta.title || '';
      changes.push('Set Twitter title from meta title');
      break;
    }
    default:
      throw new Error(`Unknown fix: ${fixId}`);
  }

  return { changes, updates };
}
