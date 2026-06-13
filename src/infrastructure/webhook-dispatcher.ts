export interface WebhookConfig {
  url: string;
  secret?: string;
  events: string[];
  maxAttempts: number;
  timeoutMs: number;
}

export interface WebhookDelivery {
  id: string;
  webhookUrl: string;
  event: string;
  payload: unknown;
  status: "pending" | "success" | "failed";
  attempts: number;
  lastError?: string;
  createdAt: number;
}

export class WebhookDispatcher {
  private configs: WebhookConfig[] = [];
  private deliveries: WebhookDelivery[] = [];
  private maxDeliveries: number = 1000;

  constructor(maxDeliveries?: number) {
    if (maxDeliveries) this.maxDeliveries = maxDeliveries;
  }

  register(config: WebhookConfig): void {
    this.configs.push(config);
  }

  unregister(url: string): void {
    this.configs = this.configs.filter((c) => c.url !== url);
  }

  async dispatch(event: string, payload: unknown): Promise<void> {
    const matching = this.configs.filter((c) => c.events.includes(event) || c.events.includes("*"));
    for (const config of matching) {
      await this.sendWithRetry(config, event, payload);
    }
  }

  private async sendWithRetry(config: WebhookConfig, event: string, payload: unknown): Promise<void> {
    const delivery: WebhookDelivery = {
      id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      webhookUrl: config.url,
      event, payload, status: "pending", attempts: 0, createdAt: Date.now(),
    };
    this.deliveries.push(delivery);

    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
      delivery.attempts++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (config.secret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw", encoder.encode(config.secret),
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
          );
          const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
          headers["X-Webhook-Signature"] = Array.from(new Uint8Array(signature))
            .map((b) => b.toString(16).padStart(2, "0")).join("");
        }
        const response = await fetch(config.url, { method: "POST", headers, body, signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          delivery.status = "success";
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        delivery.lastError = String(err);
        if (attempt < config.maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }
    delivery.status = "failed";
  }

  getDeliveries(event?: string): WebhookDelivery[] {
    if (event) return this.deliveries.filter((d) => d.event === event);
    return this.deliveries;
  }
}
