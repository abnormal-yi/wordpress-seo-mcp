import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { z } from 'zod';
import { createMcpServer, createTransport } from './transport.js';
import { ToolRegistry } from './orchestrator.js';
import { SitePool } from './services/wordpress/site-pool.js';
import { SqliteStorage } from './services/storage/sqlite.js';
import { GscClient } from './services/external/gsc.js';
import { PageSpeedClient } from './services/external/psi.js';
import { createManagementPlugin } from './plugins/management.js';
import { createMetaPlugin } from './plugins/meta/index.js';
import { createSchemaPlugin } from './plugins/schema/index.js';
import { createContentPlugin } from './plugins/content/index.js';
import { createImagePlugin } from './plugins/images/index.js';
import { createTechnicalPlugin } from './plugins/technical/index.js';
import { createRollbackPlugin } from './plugins/rollback.js';
import { createSitemapPlugin } from './plugins/sitemap/index.js';
import { createKeywordPlugin } from './plugins/keyword/index.js';
import { createIntegrationPlugin } from './plugins/integration/index.js';
import { createOrchestrationPlugin } from './plugins/orchestration/index.js';
import { createBatchAnalyzePlugin } from './plugins/orchestration/batch-analyze.js';

// Phase 1 Infrastructure
import { EventBus } from './core/event-bus.js';
import { ConfigManager } from './core/config-manager.js';
import { CacheHierarchy } from './infrastructure/cache-hierarchy.js';
import { LockManager } from './infrastructure/lock-manager.js';
import { Telemetry } from './infrastructure/telemetry.js';
import { ShutdownHandler } from './infrastructure/shutdown-handler.js';
import { MigrationRunner } from './infrastructure/migration-runner.js';
import { SecurityStore } from './infrastructure/security-store.js';
import { PriorityQueue } from './infrastructure/priority-queue.js';
import { JobScheduler } from './infrastructure/job-scheduler.js';
import { EventStore } from './infrastructure/event-store.js';
import { SnapshotManager } from './infrastructure/snapshot-manager.js';
import { ScoringEngine } from './infrastructure/scoring-engine.js';
import { CredentialManager } from './infrastructure/credential-manager.js';
import { CircuitBreaker } from './infrastructure/circuit-breaker.js';
import { RateLimiter } from './infrastructure/rate-limiter.js';
import { PluginLoader } from './plugin-sdk/loader.js';
import { PluginSandbox } from './plugin-sdk/sandbox.js';
import { WebhookDispatcher } from './infrastructure/webhook-dispatcher.js';
import { WorkflowEngine } from './infrastructure/workflow-engine.js';
import { RulesEngine } from './infrastructure/rules-engine.js';
import { Pipeline } from './middleware/pipeline.js';

// Initialize database and run migrations
const DB_PATH = process.env['SEO_DB_PATH'] || './data/seo.db';
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
new MigrationRunner(db).run();

// Initialize infrastructure
const eventBus = new EventBus();
const configManager = new ConfigManager();
const cache = new CacheHierarchy();
const lockManager = new LockManager();
const telemetry = new Telemetry();
const shutdownHandler = new ShutdownHandler();
const eventStore = new EventStore();
const snapshotManager = new SnapshotManager();
const scoringEngine = new ScoringEngine();
const credentialManager = new CredentialManager();
const securityStore = new SecurityStore(db);
const circuitBreaker = new CircuitBreaker(undefined, eventBus);
const rateLimiter = new RateLimiter();
const pluginLoader = new PluginLoader();
const pluginSandbox = new PluginSandbox();
const webhookDispatcher = new WebhookDispatcher();
const priorityQueue = new PriorityQueue(undefined, undefined, eventBus);
const jobScheduler = new JobScheduler(priorityQueue);
const workflowEngine = new WorkflowEngine(eventBus);
const rulesEngine = new RulesEngine(db, eventBus);
const pipeline = new Pipeline(telemetry);

// Set up clean shutdown
shutdownHandler.onShutdown(async () => {
  jobScheduler.stopAll();
  priorityQueue.stop();
  db.close();
  console.log("WordPress SEO MCP shutting down");
});

// Periodically log telemetry
if (configManager.get("telemetry.enabled")) {
  setInterval(() => {
    const s = telemetry.snapshot();
    console.log("[telemetry] counters:", JSON.stringify(s.counters));
  }, 60000);
}

// Server setup
const server = createMcpServer({
  name: 'wordpress-seo-mcp',
  version: '1.0.0',
});

// Existing components (using new infra where possible)
const sitePool = new SitePool(eventBus, lockManager, telemetry);
const storage = new SqliteStorage();
const registry = new ToolRegistry();

const gscApiKey = process.env['GSC_API_KEY'];
const gscSiteUrl = process.env['GSC_SITE_URL'];
const gscClient = gscApiKey && gscSiteUrl
  ? new GscClient({ apiKey: gscApiKey, siteUrl: gscSiteUrl })
  : undefined;

// Register existing plugins
registry.register(createManagementPlugin(sitePool));
registry.register(createMetaPlugin(sitePool));
registry.register(createSchemaPlugin(sitePool));
registry.register(createContentPlugin(sitePool));
registry.register(createImagePlugin(sitePool));
registry.register(createTechnicalPlugin(sitePool));
registry.register(createRollbackPlugin(sitePool, storage));
registry.register(createSitemapPlugin(sitePool, gscClient));
registry.register(createKeywordPlugin());
registry.register(createIntegrationPlugin(gscClient, undefined));
registry.register(createOrchestrationPlugin(rulesEngine));
registry.register(createBatchAnalyzePlugin(sitePool, scoringEngine, snapshotManager, eventBus));

// Register new Phase 1 infrastructure tools
registry.register({
  id: 'infrastructure',
  tools: [
    {
      name: 'infra-status',
      description: 'Get status of all infrastructure components',
      inputSchema: z.object({}),
      handler: async () => ({
        success: true,
        data: {
          cacheSize: cache.size,
          queueSize: priorityQueue.size(),
          eventCount: eventStore.count(),
          snapshotCount: snapshotManager.count(),
          circuitStates: {},
          listenerCount: eventBus.listenerCount(),
          uptime: telemetry.uptime(),
        },
      }),
    },
    {
      name: 'infra-events',
      description: 'Query recent events from the event store',
      inputSchema: z.object({
        type: z.string().optional(),
        siteId: z.string().optional(),
        limit: z.number().optional(),
      }),
      handler: async (args) => ({
        success: true,
        data: eventStore.query({ type: args.type, siteId: args.siteId, limit: args.limit }),
      }),
    },
    {
      name: 'infra-telemetry',
      description: 'Get telemetry snapshot (counters and histograms)',
      inputSchema: z.object({}),
      handler: async () => ({
        success: true,
        data: telemetry.snapshot(),
      }),
    },
    {
      name: 'infra-config',
      description: 'Get or set configuration values',
      inputSchema: z.object({
        action: z.enum(['get', 'set']),
        path: z.string(),
        value: z.any().optional(),
        siteId: z.string().optional(),
      }),
      handler: async (args) => {
        if (args.action === 'get') {
          return { success: true, data: configManager.get(args.path, args.siteId) };
        }
        if (args.action === 'set' && args.value !== undefined) {
          configManager.setSiteConfig(args.siteId || '__global__', { [args.path.split('.')[0]]: { [args.path.split('.').slice(1).join('.')]: args.value } });
          return { success: true, data: { message: 'Config updated' } };
        }
        return { success: false, error: 'Invalid action or missing value' };
      },
    },
  ],
});

server.setRequestHandler({ method: 'tools/list' } as any, async () => ({
  tools: registry.getToolDefinitions(),
}));

server.setRequestHandler({ method: 'tools/call' } as any, async (request: any) => {
  const { name, arguments: args } = request.params;
  const start = Date.now();
  telemetry.incrementCounter("tools.called", 1, { tool: name });

  const ctx = { tool: name, args: args ?? {}, startTime: start, errors: [] as string[] };
  try {
    await pipeline.run(ctx);
    const result = await registry.execute(name, args ?? {});
    telemetry.observeHistogram("tools.duration", Date.now() - start, { tool: name });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    telemetry.incrementCounter("tools.errors", 1, { tool: name });
    telemetry.observeHistogram("tools.duration", Date.now() - start, { tool: name });
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(err) }) }],
      isError: true,
    };
  }
});

const transport = createTransport();
await server.connect(transport);
