import type { SEOEvent, SEOEventHandler } from "../types/events";

interface Subscription {
  pattern: string;
  handler: SEOEventHandler;
  filter?: { siteId?: string };
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped
    .replace(/\*\*/g, "__DOUBLESTAR__")
    .replace(/\*/g, "[^:]*")
    .replace(/__DOUBLESTAR__/g, ".*") + "$";
  return new RegExp(regexStr);
}

export class EventBus {
  private subscriptions: Subscription[] = [];

  on(pattern: string, handler: SEOEventHandler, filter?: { siteId?: string }): () => void {
    const sub: Subscription = { pattern, handler, filter };
    this.subscriptions.push(sub);
    return () => this.off(pattern, handler);
  }

  off(pattern: string, handler: SEOEventHandler): void {
    this.subscriptions = this.subscriptions.filter(
      (s) => !(s.pattern === pattern && s.handler === handler)
    );
  }

  emit(event: SEOEvent): void {
    for (const sub of this.subscriptions) {
      const regex = patternToRegex(sub.pattern);
      if (!regex.test(event.type)) continue;
      if (sub.filter?.siteId && sub.filter.siteId !== event.metadata.siteId) continue;
      try {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          result.catch((err) => console.error("Event handler error:", err));
        }
      } catch (err) {
        console.error("Event handler error:", err);
      }
    }
  }

  clear(): void {
    this.subscriptions = [];
  }

  listenerCount(): number {
    return this.subscriptions.length;
  }
}
