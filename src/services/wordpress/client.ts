import axios, { AxiosInstance } from 'axios';
import { SiteConfig, WpPost } from '../../types/wordpress.js';

export class WpClient {
  private http: AxiosInstance;
  readonly baseUrl: string;

  constructor(config: SiteConfig) {
    const base = config.url.replace(/\/+$/, '');
    this.baseUrl = `${base}/wp-json/wp/v2`;
    this.http = axios.create({
      baseURL: this.baseUrl,
      auth: { username: config.username, password: config.appPassword },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  async getPost(postId: number): Promise<WpPost> {
    const { data } = await this.http.get(`/posts/${postId}`, {
      params: { _fields: 'id,title,content,excerpt,slug,status,meta,yoast_head_json' },
    });
    return data;
  }

  async updatePost(postId: number, updates: Record<string, any>): Promise<WpPost> {
    const { data } = await this.http.post(`/posts/${postId}`, updates);
    return data;
  }

  async getPosts(params?: { per_page?: number; offset?: number; status?: string }): Promise<WpPost[]> {
    const { data } = await this.http.get('/posts', { params });
    return data;
  }

  async getSiteUrl(): Promise<string> {
    const { data } = await this.http.get('/');
    return data.url as string;
  }

  async getYoastMeta(postId: number): Promise<Record<string, any>> {
    try {
      const post = await this.getPost(postId);
      return post.yoast_head_json ?? {};
    } catch {
      const { data } = await this.http.get(`/posts/${postId}`, {
        params: { _fields: 'meta' },
      });
      return data.meta ?? {};
    }
  }
}
