import axios from 'axios';

export interface GscConfig {
  apiKey: string;
  siteUrl: string;
}

export interface GscSearchRow {
  queries: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export class GscClient {
  private http = axios.create({ baseURL: 'https://searchconsole.googleapis.com/v1' });

  constructor(private config: GscConfig) {}

  async getSearchAnalytics(startDate: string, endDate: string, rowLimit = 10): Promise<GscSearchRow[]> {
    const { data } = await this.http.post(
      `/sites/${encodeURIComponent(this.config.siteUrl)}/searchAnalytics/query`,
      { startDate, endDate, dimensions: ['query'], rowLimit },
      { params: { key: this.config.apiKey } }
    );
    return (data.rows ?? []).map((r: any) => ({
      queries: r.keys,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));
  }

  async submitSitemap(sitemapUrl: string): Promise<void> {
    await this.http.put(
      `/sites/${encodeURIComponent(this.config.siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
      {},
      { params: { key: this.config.apiKey } }
    );
  }
}
