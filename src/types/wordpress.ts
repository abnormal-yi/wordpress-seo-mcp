import { z } from 'zod';

export const SiteConfigSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  username: z.string().min(1),
  appPassword: z.string().min(1),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;

export interface WpPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  slug: string;
  status: string;
  meta: Record<string, any>;
  yoast_head_json?: {
    title?: string;
    description?: string;
    og_title?: string;
    og_description?: string;
    og_image?: string[];
    twitter_title?: string;
    twitter_description?: string;
  };
}

export interface WpImage {
  id?: number;
  url: string;
  alt: string;
  width?: number;
  height?: number;
}
