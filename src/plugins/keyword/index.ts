import { z } from 'zod';
import { ToolPlugin } from '../../orchestrator.js';
import { suggestKeywords } from './suggester.js';

export function createKeywordPlugin(): ToolPlugin {
  return {
    id: 'keyword',
    tools: [
      {
        name: 'suggest-keywords',
        description: 'Suggest SEO keywords for a topic',
        inputSchema: z.object({
          topic: z.string(),
        }),
        handler: async (args) => {
          const result = suggestKeywords(args.topic);
          return { success: true, data: result };
        },
      },
    ],
  };
}
