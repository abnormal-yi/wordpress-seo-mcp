import axios from 'axios';

export interface PageSpeedResult {
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  score: number | null;
}

export class PageSpeedClient {
  private http = axios.create({ baseURL: 'https://www.googleapis.com/pagespeedonline/v5' });

  async analyze(url: string, apiKey: string): Promise<PageSpeedResult> {
    const { data } = await this.http.get('/runPagespeed', {
      params: { url, key: apiKey, strategy: 'mobile' },
    });
    const audits = data.lighthouseResult?.audits ?? {};
    return {
      lcp: audits['largest-contentful-paint']?.numericValue ?? null,
      cls: audits['cumulative-layout-shift']?.numericValue ?? null,
      tbt: audits['total-blocking-time']?.numericValue ?? null,
      score: data.lighthouseResult?.categories?.performance?.score ?? null,
    };
  }
}
