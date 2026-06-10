import { z } from 'zod';
import { MCPToolDefinition, ToolResponse } from './types/mcp.js';

export interface ToolPlugin {
  id: string;
  tools: MCPToolDefinition[];
}

export class ToolRegistry {
  private tools: Map<string, MCPToolDefinition> = new Map();

  register(plugin: ToolPlugin) {
    for (const tool of plugin.tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getToolDefinitions() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async execute(name: string, args: Record<string, any>): Promise<ToolResponse> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    try {
      const validated = tool.inputSchema.parse(args);
      return await tool.handler(validated);
    } catch (err: any) {
      return { success: false, error: err.message ?? String(err) };
    }
  }
}
