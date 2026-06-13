import * as fs from "fs";
import * as path from "path";
import type { SEOPlugin } from "../types/plugins";
import { PluginError } from "../infrastructure/error-classes";

export class PluginLoader {
  private plugins: Map<string, SEOPlugin> = new Map();

  loadFromDirectory(dirPath: string): SEOPlugin[] {
    const loaded: SEOPlugin[] = [];
    if (!fs.existsSync(dirPath)) return loaded;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginDir = path.join(dirPath, entry.name);
        const pkgPath = path.join(pluginDir, "package.json");
        if (!fs.existsSync(pkgPath)) continue;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const plugin: SEOPlugin = require(pluginDir);
          this.register(plugin);
          loaded.push(plugin);
        } catch (err) {
          throw new PluginError(`Failed to load plugin from ${pluginDir}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const plugin: SEOPlugin = require(path.join(dirPath, entry.name));
          this.register(plugin);
          loaded.push(plugin);
        } catch (err) {
          throw new PluginError(`Failed to load plugin ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return loaded;
  }

  loadSingle(filePath: string): SEOPlugin {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) throw new PluginError(`Plugin file not found: ${resolved}`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const plugin: SEOPlugin = require(resolved);
      this.register(plugin);
      return plugin;
    } catch (err) {
      throw new PluginError(`Failed to load plugin ${resolved}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  register(plugin: SEOPlugin): void {
    if (this.plugins.has(plugin.manifest.name)) {
      throw new PluginError(`Plugin "${plugin.manifest.name}" is already registered`);
    }
    this.plugins.set(plugin.manifest.name, plugin);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  get(name: string): SEOPlugin | undefined {
    return this.plugins.get(name);
  }

  list(): SEOPlugin[] {
    return Array.from(this.plugins.values());
  }

  clear(): void {
    this.plugins.clear();
  }
}
