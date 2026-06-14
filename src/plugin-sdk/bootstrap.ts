/**
 * plugin-sdk/bootstrap.ts
 * Loads external SEO plugins from the directory specified by SEO_PLUGINS_DIR env var.
 *
 * Before this file existed, PluginLoader and PluginSandbox were instantiated in
 * index.ts but never called — so external plugins could never be loaded at all.
 *
 * How external plugins work:
 *   1. User sets SEO_PLUGINS_DIR=/path/to/my-plugins in .env
 *   2. Each subfolder must have a package.json + SKILL.md-style plugin export
 *      that satisfies the SEOPlugin interface (manifest + analyze? + apply?)
 *   3. At startup, this bootstrap loads them and registers each as a ToolPlugin
 *      in the ToolRegistry, with all calls routed through PluginSandbox (timeout guard)
 */

import * as path from 'path';
import * as fs from 'fs';
import type { PluginLoader } from './loader.js';
import type { PluginSandbox } from './sandbox.js';
import type { ToolRegistry } from '../orchestrator.js';
import type { EventBus } from '../core/event-bus.js';

export async function bootstrapExternalPlugins(
  loader: PluginLoader,
  sandbox: PluginSandbox,
  registry: ToolRegistry,
  bus: EventBus,
): Promise<void> {
  const pluginsDir = process.env['SEO_PLUGINS_DIR'];

  if (!pluginsDir) {
    console.log('[plugins] SEO_PLUGINS_DIR not set — skipping external plugin load');
    return;
  }

  const resolved = path.resolve(pluginsDir);
  if (!fs.existsSync(resolved)) {
    console.warn(`[plugins] SEO_PLUGINS_DIR '${resolved}' does not exist — skipping`);
    return;
  }

  let loaded;
  try {
    loaded = await loader.loadFromDirectory(resolved);
  } catch (err) {
    console.error(`[plugins] Failed to load from '${resolved}':`, String(err));
    bus.emit('plugin:error', { dir: resolved, error: String(err) });
    return;
  }

  for (const plugin of loaded) {
    const name = plugin.manifest.name;
    try {
      // Wrap each external plugin capability as a ToolPlugin so it appears
      // in the MCP tools list alongside the built-in plugins
      registry.register({
        id: `ext:${name}`,
        tools: [
          ...(plugin.analyze ? [{
            name: `${name}-analyze`,
            description: plugin.manifest.description ?? `Run ${name} analysis`,
            inputSchema: plugin.manifest.inputSchema as any,
            handler: async (args: any) => {
              try {
                const result = await sandbox.analyze(plugin, { args });
                bus.emit('analysis:complete', { plugin: name, result });
                return { success: true, data: result };
              } catch (err) {
                bus.emit('analysis:failed', { plugin: name, error: String(err) });
                return { success: false, error: String(err) };
              }
            },
          }] : []),
          ...(plugin.apply ? [{
            name: `${name}-apply`,
            description: `Apply ${name} fixes`,
            inputSchema: plugin.manifest.inputSchema as any,
            handler: async (args: any) => {
              try {
                const result = await sandbox.apply(plugin, { args });
                bus.emit('apply:complete', { plugin: name, result });
                return { success: true, data: result };
              } catch (err) {
                bus.emit('apply:failed', { plugin: name, error: String(err) });
                return { success: false, error: String(err) };
              }
            },
          }] : []),
        ],
      });

      bus.emit('plugin:loaded', { name, version: plugin.manifest.version });
      console.log(`[plugins] Loaded external plugin: ${name} v${plugin.manifest.version ?? 'unknown'}`);
    } catch (err) {
      console.error(`[plugins] Failed to register '${name}':`, String(err));
      bus.emit('plugin:error', { name, error: String(err) });
    }
  }

  if (loaded.length === 0) {
    console.log(`[plugins] No external plugins found in '${resolved}'`);
  }
}
