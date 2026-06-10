import { describe, it, expect } from 'vitest';
import { ToolRegistry, ToolPlugin } from '../../src/orchestrator.js';
import { z } from 'zod';

describe('ToolRegistry', () => {
  it('registers and executes a tool', async () => {
    const r = new ToolRegistry();
    const plugin: ToolPlugin = {
      id: 'test',
      tools: [{
        name: 'ping',
        description: 'Returns pong',
        inputSchema: z.object({}),
        handler: async () => ({ success: true, data: 'pong' }),
      }],
    };
    r.register(plugin);
    const result = await r.execute('ping', {});
    expect(result.success).toBe(true);
    expect(result.data).toBe('pong');
  });

  it('returns error for unknown tool', async () => {
    const r = new ToolRegistry();
    const result = await r.execute('nope', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('validates input schema', async () => {
    const r = new ToolRegistry();
    const plugin: ToolPlugin = {
      id: 'test',
      tools: [{
        name: 'needs-name',
        description: '',
        inputSchema: z.object({ name: z.string() }),
        handler: async (args) => ({ success: true, data: `Hello ${args.name}` }),
      }],
    };
    r.register(plugin);
    const result = await r.execute('needs-name', { name: 123 });
    expect(result.success).toBe(false);
  });

  it('lists tool definitions', () => {
    const r = new ToolRegistry();
    const plugin: ToolPlugin = {
      id: 'test',
      tools: [{
        name: 'tool-a',
        description: 'Does A',
        inputSchema: z.object({}),
        handler: async () => ({ success: true }),
      }],
    };
    r.register(plugin);
    const defs = r.getToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('tool-a');
  });
});
