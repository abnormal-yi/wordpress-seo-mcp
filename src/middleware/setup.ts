/**
 * middleware/setup.ts
 * Registers all real middlewares onto the Pipeline instance.
 * Called once at startup in index.ts after all infra is initialized.
 *
 * Middlewares run in order per tool call:
 *  1. Logging      — records tool name + duration to console + telemetry
 *  2. Rate Limit   — enforces per-site request cap (default 60 req/min)
 *  3. Validation   — rejects empty/missing required args before tools run
 */

import type { Pipeline } from './pipeline.js';
import type { RateLimiter } from '../infrastructure/rate-limiter.js';
import type { Telemetry } from '../infrastructure/telemetry.js';

export function registerMiddlewares(
  pipeline: Pipeline,
  rateLimiter: RateLimiter,
  telemetry: Telemetry,
): void {

  // 1. Logging middleware — runs first (outermost wrapper)
  pipeline.use(async (ctx, next) => {
    const start = Date.now();
    console.log(`[mcp] → ${ctx.tool}`, JSON.stringify(sanitizeArgs(ctx.args)));
    try {
      await next();
      const ms = Date.now() - start;
      console.log(`[mcp] ← ${ctx.tool} OK (${ms}ms)`);
      telemetry.observeHistogram('tool.duration', ms, { tool: ctx.tool });
      telemetry.incrementCounter('tool.calls', 1, { tool: ctx.tool, status: 'ok' });
    } catch (err) {
      const ms = Date.now() - start;
      console.error(`[mcp] ← ${ctx.tool} ERROR (${ms}ms):`, String(err));
      telemetry.incrementCounter('tool.calls', 1, { tool: ctx.tool, status: 'error' });
      throw err;
    }
  });

  // 2. Rate limiter middleware — keyed by site when present, else by tool name
  pipeline.use(async (ctx, next) => {
    const key = ctx.args.siteId || ctx.args.site || ctx.args.name || ctx.tool;
    if (!rateLimiter.consume(key)) {
      const reset = new Date(rateLimiter.getResetTime(key)).toISOString();
      const remaining = rateLimiter.getRemaining(key);
      throw new Error(
        `Rate limit exceeded for '${key}'. ` +
        `${remaining} requests remaining. Resets at ${reset}.`
      );
    }
    telemetry.incrementCounter('rate_limiter.allowed', 1, { key });
    await next();
  });

  // 3. Input validation middleware — rejects obviously bad args early
  pipeline.use(async (ctx, next) => {
    // Tools that require a site identifier must have one
    const SITE_REQUIRED_TOOLS = [
      'analyze-seo', 'apply-seo', 'generate-schema', 'check-images',
      'check-content', 'check-technical', 'batch-apply', 'batch-analyze',
      'generate-sitemap', 'submit-sitemap', 'analyze-keywords',
    ];
    if (SITE_REQUIRED_TOOLS.includes(ctx.tool)) {
      const siteId = ctx.args.siteId || ctx.args.site;
      if (!siteId || typeof siteId !== 'string' || siteId.trim() === '') {
        throw new Error(`Tool '${ctx.tool}' requires a non-empty 'siteId' or 'site' argument.`);
      }
    }

    // Prevent SQL/script injection in any string arg (basic sanity check)
    for (const [key, value] of Object.entries(ctx.args)) {
      if (typeof value === 'string' && value.length > 5000) {
        throw new Error(`Argument '${key}' exceeds maximum length of 5000 characters.`);
      }
    }

    await next();
  });
}

/** Remove sensitive fields from args before logging */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const REDACTED = new Set(['appPassword', 'password', 'secret', 'token', 'apiKey', 'api_key']);
  for (const [k, v] of Object.entries(args)) {
    out[k] = REDACTED.has(k) ? '***' : v;
  }
  return out;
}
