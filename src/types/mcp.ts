import { z } from 'zod';

export const ToolResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type ToolResponse = z.infer<typeof ToolResponseSchema>;

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: any) => Promise<ToolResponse>;
}
