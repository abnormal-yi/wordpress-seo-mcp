export type MetaPlugin = 'yoast' | 'rankmath' | 'custom';

export function detectMetaPlugin(headers: Record<string, string>): MetaPlugin {
  if (headers['x-yoast-site']) return 'yoast';
  if (headers['x-rankmath-site']) return 'rankmath';
  return 'custom';
}

export function getMetaFieldNames(plugin: MetaPlugin) {
  switch (plugin) {
    case 'yoast':
      return { title: '_yoast_wpseo_title', description: '_yoast_wpseo_metadesc', focusKeyword: '_yoast_wpseo_focuskw' };
    case 'rankmath':
      return { title: 'rank_math_title', description: 'rank_math_description', focusKeyword: 'rank_math_focus_keyword' };
    case 'custom':
      return { title: 'seo_title', description: 'seo_description', focusKeyword: '' };
  }
}
