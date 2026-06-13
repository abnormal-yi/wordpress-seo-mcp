# AUDIT.md — wordpress-seo-mcp Code Audit

Date: 2026-06-13
Scope: Full review of `src/` (4013 LOC across ~30 files), `package.json`, `README.md`.
Purpose: Document current state, dead/disconnected code, security issues, and required
changes before this server is used against production WordPress sites (client credentials).

This file is meant as a handoff so another AI/dev can pick up exactly where this audit
left off. No code has been changed yet — this is observation only.

---

## 1. CRITICAL — Credential handling is broken/disconnected

**Files involved:** `src/services/wordpress/site-pool.ts`, `src/infrastructure/credential-manager.ts`,
`src/infrastructure/security-store.ts`, `src/types/wordpress.ts`, `src/services/wordpress/client.ts`,
`src/index.ts`

**Findings:**
- `SiteConfigSchema` (types/wordpress.ts) includes `appPassword` as a plain string.
- `SitePool.addSite()` stores the full parsed `SiteConfig` — including `appPassword` —
  in an in-memory `Map`, in plaintext. `getConfig(name)` returns this object as-is.
- `WpClient` (services/wordpress/client.ts) takes the plaintext `appPassword` and uses it
  directly in axios `auth: { username, password }`.
- `CredentialManager` (AES-256-GCM, 600k PBKDF2-style key handling) exists and is
  correctly implemented in isolation, but is **never instantiated or imported** in
  `index.ts` or `site-pool.ts`. It is dead code.
- `SecurityStore` (SQLite-backed encrypted credential table + audit log) **is**
  instantiated in `index.ts` (`new SecurityStore(db)`), but is **never called** —
  no `storeCredential`/`getCredential`/`logAudit` calls exist anywhere in the codebase
  (verified via grep across `src/`).
- `CredentialManager` falls back to `crypto.randomBytes(32)` for its master key if
  `SEO_ENCRYPTION_KEY` is not set in env — and this generated key is **not persisted**
  anywhere. Even if wired up, restarting the process would make all previously
  encrypted credentials permanently unreadable unless `SEO_ENCRYPTION_KEY` is set as a
  fixed env var.

**Required changes:**
1. Wire `SitePool.addSite()` to call `CredentialManager.store(siteId, appPassword)` /
   `SecurityStore.storeCredential(...)` and keep only a reference/handle in the
   in-memory site map — not the raw password.
2. `WpClient` should receive the decrypted password at construction time only
   (in-memory for the life of the client instance), never persist it elsewhere.
3. `getConfig()` must redact `appPassword` (e.g. return `"***"` or omit the field)
   when returned to any tool output / logs.
4. Require `SEO_ENCRYPTION_KEY` to be set via `.env` (document in `.env.example` and
   README) — fail fast at startup with a clear error if missing, rather than silently
   generating an ephemeral key.
5. Add `SecurityStore.logAudit()` calls around credential add/remove/rotate.
6. Add a startup check: if `SEO_ENCRYPTION_KEY` changes but encrypted credentials exist
   in `seo.db`, fail with a clear migration error rather than silently failing to decrypt.

---

## 2. Dead/unused "Phase 1 Infrastructure" components

**File:** `src/index.ts` (lines ~30–60, instantiation block)

The following are instantiated in `index.ts` but have **zero call sites** outside their
own files / tests (verified via grep):

| Component | File | Status |
|---|---|---|
| `CredentialManager` | infrastructure/credential-manager.ts | Not imported in index.ts at all |
| `SecurityStore` | infrastructure/security-store.ts | Instantiated, never called |
| `PluginLoader` | plugin-sdk/loader.ts | Instantiated, never called |
| `PluginSandbox` | plugin-sdk/sandbox.ts | Instantiated, never called |
| `WebhookDispatcher` | infrastructure/webhook-dispatcher.ts | Instantiated, never called |
| `WorkflowEngine` | infrastructure/workflow-engine.ts | Instantiated, never called |
| `RateLimiter` | infrastructure/rate-limiter.ts | Instantiated, never called |
| `Pipeline` (middleware) | middleware/pipeline.ts | `pipeline.run(ctx)` is called per tool call in index.ts, but **no middleware is ever registered via `pipeline.use(...)`** — so it currently runs zero middlewares every request (dead overhead) |
| `EventStore` | infrastructure/event-store.ts | Only read via `infra-events` tool; nothing ever writes to it (no `.append`/`.record` calls found) |
| `SnapshotManager` | infrastructure/snapshot-manager.ts | Used only inside batch-analyze/batch-apply/multi-site — confirm it's actually populated before being read |

**Required changes (pick one path per component):**
- **Either** wire each into the actual request flow (e.g. register real middlewares:
  auth check, input validation, rate limiting, logging — these are literally listed
  in the README architecture diagram but don't exist as `pipeline.use()` calls),
- **or** remove the unused instantiation and imports to reduce surface area and
  confusion for anyone reading `index.ts`.

Given the README explicitly advertises a "Middleware Pipeline" with
`Logging / Auth / Validation / Rate Limit / Cache` — and none of these exist as
middleware — this is a **documentation-vs-reality mismatch** that should be fixed
either by implementing the middlewares or correcting the README.

---

## 3. `better-sqlite3` is optionalDependency but required at import time

**File:** `package.json` (`optionalDependencies.better-sqlite3`), `src/index.ts` (top-level
`import Database from "better-sqlite3"`, used unconditionally to open `seo.db` and run
migrations before the server even starts).

If `better-sqlite3` fails to install (common on systems without build tools, since it's
a native module), the entire server fails to start — there is no fallback path despite
it being marked "optional". Either:
- Make it a regular `dependency` (accurate to actual requirement), **or**
- Add a real optional code path (e.g. in-memory storage fallback) for `SqliteStorage`
  and skip `MigrationRunner`/`SecurityStore` setup when the module is absent.

---

## 4. Circuit breaker / rate limiting only covers batch paths

**Files:** `src/plugins/orchestration/batch-apply.ts`, `src/infrastructure/action-dispatcher.ts`

`CircuitBreaker.isAllowed/onSuccess/onFailure` is only called from the batch-apply
plugin and the action-dispatcher (self-healing automation). Single-site tools
(`analyze-seo`, `apply-seo`, etc., which call `WpClient` directly via `SitePool`) have
**no circuit breaker or rate limiting** at all — a misbehaving/slow WordPress site can
be hammered repeatedly with no backoff on the most commonly used tools.

**Required change:** Either route all `WpClient` calls through the circuit breaker
(e.g. wrap inside `SitePool.getClient` usage sites, or inside `WpClient` itself keyed
by site name), or document this limitation clearly.

---

## 5. Type-safety workarounds (`as any`) on MCP SDK handlers

**File:** `src/index.ts`

```ts
server.setRequestHandler({ method: 'tools/list' } as any, async () => ({ ... }));
server.setRequestHandler({ method: 'tools/call' } as any, async (request: any) => { ... });
```

`as any` casts here suggest the installed `@modelcontextprotocol/sdk` version's
`setRequestHandler` signature (which normally expects a Zod schema, not a plain object
with `method`) doesn't match what's being passed. This likely "works" at runtime only
because of loose typing, but should be replaced with the SDK's actual exported request
schemas (e.g. `ListToolsRequestSchema`, `CallToolRequestSchema` from
`@modelcontextprotocol/sdk/types.js`) to avoid silent breakage on SDK upgrades.

---

## 6. README vs. actual `.env` / config surface

- README's "Quick Start" config example only shows `opencode.jsonc`. No example for
  Claude Desktop / Claude Code `mcp_config.json`, despite README claiming compatibility
  with "Claude Code" first in its list.
- `.env.example` only documents `GSC_API_KEY` / `GSC_SITE_URL`. Missing:
  - `SEO_ENCRYPTION_KEY` (required once credential fix in §1 is implemented)
  - `SEO_DB_PATH` (referenced in `index.ts` via `process.env['SEO_DB_PATH']`, undocumented)
  - `telemetry.enabled` config flag source (read via `configManager.get("telemetry.enabled")`
    — unclear if this maps to an env var or only a config file)

**Required change:** Update `.env.example` and add a Claude Desktop config snippet to README.

---

## 7. No LICENSE file

`package.json`/README make no license claim, and there is no `LICENSE` file in the repo
root. Should be added (MIT suggested, matching the `swahili-skill` companion repo) if
this is meant to be a public/open tool.

---

## 8. Minor / lower priority

- `ConfigManager.setSiteConfig` path-splitting in `index.ts`'s `infra-config` tool
  (`args.path.split('.')[0]` / `.slice(1).join('.')`) is fragile for deeply nested paths
  and has no validation — a malformed `path` silently produces `{ undefined: {...} }`.
- `JobScheduler.schedule("automation-rules-check", "meta", 60000, {})` runs every 60s
  unconditionally from server start — confirm this is desired default behavior for a
  tool that's supposed to be on-demand via MCP, and that it can be disabled via config
  for users who don't want background automation touching their sites.
- No test coverage was inspected yet for the credential path specifically — once §1 is
  fixed, add tests asserting `getConfig()`/tool outputs never contain raw `appPassword`.

---

## Priority order for fixes

1. **§1 — Credential encryption wiring** (blocks safe use with real client sites)
2. **§3 — better-sqlite3 dependency correctness** (blocks reliable install/start)
3. **§2 — Dead infrastructure** (either wire or remove; affects maintainability and
   README accuracy)
4. **§5 — MCP SDK type casts** (future-proofing against SDK upgrades)
5. **§4, §6, §7, §8** — polish / documentation / coverage

No code changes have been made as part of this audit. Next step: implement §1 first,
since it's the blocking issue for any real-world use with client WordPress credentials.
