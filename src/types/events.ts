export type SEOEventType =
  | "site:added" | "site:removed" | "site:updated"
  | "analysis:start" | "analysis:complete" | "analysis:failed"
  | "apply:start" | "apply:complete" | "apply:failed" | "apply:rollback"
  | "error:threshold" | "circuit:open" | "circuit:close" | "circuit:half-open"
  | "cache:miss" | "cache:hit" | "cache:invalidated"
  | "sitemap:generated" | "sitemap:submitted"
  | "schedule:triggered" | "auto-fix:executed" | "auto-fix:skipped"
  | "queue:job-added" | "queue:job-started" | "queue:job-completed" | "queue:job-failed"
  | "plugin:loaded" | "plugin:unloaded" | "plugin:error"
  | "health:check" | "health:changed"
  | "auth:login-success" | "auth:login-failure"
  | "credential:stored" | "credential:rotated" | "credential:deleted"
  | "config:changed" | "config:security-change"
  | "webhook:created" | "webhook:deleted"
  | "validation:failed" | "input:rejected"
  | "batch:started" | "batch:completed"
  | "rate-limit:exceeded"
  | "security:event";

export interface SEOEvent {
  type: SEOEventType;
  payload: unknown;
  metadata: {
    correlationId: string;
    siteId?: string;
    timestamp: number;
  };
}

export type SEOEventHandler = (event: SEOEvent) => void | Promise<void>;

export interface EventSubscription {
  pattern: string;
  handler: SEOEventHandler;
  filter?: { siteId?: string };
}
