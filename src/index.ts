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

const server = createMcpServer({
  name: 'wordpress-seo-mcp',
  version: '0.1.0',
});

const sitePool = new SitePool();
const storage = new SqliteStorage();
const registry = new ToolRegistry();

// Optional external API clients (configured via env vars)
const gscApiKey = process.env['GSC_API_KEY'];
const gscSiteUrl = process.env['GSC_SITE_URL'];
const gscClient = gscApiKey && gscSiteUrl
  ? new GscClient({ apiKey: gscApiKey, siteUrl: gscSiteUrl })
  : undefined;

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

server.setRequestHandler({ method: 'tools/list' } as any, async () => ({
  tools: registry.getToolDefinitions(),
}));

server.setRequestHandler({ method: 'tools/call' } as any, async (request: any) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await registry.execute(name, args ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(err) }) }],
      isError: true,
    };
  }
});

const transport = createTransport();
await server.connect(transport);
