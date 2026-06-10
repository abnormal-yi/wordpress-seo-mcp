import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createMcpServer(info: { name: string; version: string }) {
  return new Server(info, {
    capabilities: {
      tools: {},
      resources: {},
    },
  });
}

export function createTransport() {
  return new StdioServerTransport();
}
