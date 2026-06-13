import * as fs from "fs";
import * as path from "path";
import type { SEOPlugin } from "../types/plugins";
import { PluginError } from "../infrastructure/error-classes";

async function importPlugin(resolved: string): Promise<SEOPlugin> {
  try {
    return require(resolved);
  } catch {
    const mod = await import(resolved);
    return mod.default || mod;
  }
}

export class PluginLoader {
  private plugins: Map<string, SEOPlugin> = new Map();

  async loadFromDirectory(dirPath: string): Promise<SEOPlugin[]> {
    const loaded: SEOPlugin[] = [];
    if (!fs.existsSync(dirPath)) return loaded;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginDir = path.join(dirPath, entry.name);
        const pkgPath = path.join(pluginDir, "package.json");
        if (!fs.existsSync(pkgPath)) continue;
        try {
          const plugin = await importPlugin(pluginDir);
          this.register(plugin);
          loaded.push(plugin);
        } catch (err) {
          throw new PluginError(`Failed to load plugin from ${pluginDir}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
        try {
          const plugin = await importPlugin(path.join(dirPath, entry.name));
          this.register(plugin);
          loaded.push(plugin);
        } catch (err) {
          throw new PluginError(`Failed to load plugin ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return loaded;
  }

  async loadSingle(filePath: string): Promise<SEOPlugin> {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) throw new PluginError(`Plugin file not found: ${resolved}`);
    try {
      const plugin = await importPlugin(resolved);
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
