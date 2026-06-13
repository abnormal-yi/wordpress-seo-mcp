import { describe, it, expect, vi } from "vitest";
import { WebhookDispatcher } from "../../src/infrastructure/webhook-dispatcher";

describe("WebhookDispatcher", () => {
  it("registers webhook configs", () => {
    const wd = new WebhookDispatcher();
    wd.register({ url: "https://example.com/hook", events: ["analysis:complete"], maxAttempts: 3, timeoutMs: 5000 });
    expect(wd.getDeliveries()).toHaveLength(0);
  });

  it("unregisters webhook configs", () => {
    const wd = new WebhookDispatcher();
    wd.register({ url: "https://example.com/hook", events: ["analysis:complete"], maxAttempts: 3, timeoutMs: 5000 });
    wd.unregister("https://example.com/hook");
  });

  it("tracks delivery attempts", async () => {
    const wd = new WebhookDispatcher();
    wd.register({ url: "https://nonexistent.example.com/hook", events: ["*"], maxAttempts: 2, timeoutMs: 1000 });
    await wd.dispatch("test:event", { key: "value" });
    const deliveries = wd.getDeliveries();
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries[0].status).toBe("failed");
    expect(deliveries[0].attempts).toBeLessThanOrEqual(2);
  });

  it("filters deliveries by event", async () => {
    const wd = new WebhookDispatcher();
    wd.register({ url: "https://nonexistent.example.com/hook", events: ["test:event"], maxAttempts: 1, timeoutMs: 100 });
    await wd.dispatch("test:event", {});
    await wd.dispatch("other:event", {});
    expect(wd.getDeliveries("test:event")).toHaveLength(1);
  });

  it("creates HMAC signature when secret is configured", async () => {
    const wd = new WebhookDispatcher();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    wd.register({ url: "https://example.com/hook", secret: "mysecret", events: ["*"], maxAttempts: 1, timeoutMs: 1000 });
    await wd.dispatch("test", {});
    expect(fetchSpy).toHaveBeenCalled();
    const headers = fetchSpy.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["X-Webhook-Signature"]).toBeDefined();
    fetchSpy.mockRestore();
  });
});
