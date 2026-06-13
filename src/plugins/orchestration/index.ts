import { z } from "zod";
import type { ToolPlugin } from "../../orchestrator.js";
import type { RulesEngine } from "../../infrastructure/rules-engine.js";

export function createOrchestrationPlugin(rulesEngine: RulesEngine): ToolPlugin {
  return {
    id: "orchestration",
    tools: [
      {
        name: "automation-add-rule",
        description: "Add an automation rule that triggers actions on events or schedules",
        inputSchema: z.object({
          name: z.string().describe("Human-readable rule name"),
          triggerType: z.enum(["event", "schedule"]).describe("Type of trigger"),
          pattern: z.string().optional().describe("Event pattern (e.g. 'analysis:complete', 'site:*')"),
          cron: z.string().optional().describe("Cron expression for scheduled rules (e.g. '0 6 * * 1')"),
          conditionField: z.string().optional().describe("Field to check in event payload"),
          conditionOperator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]).optional(),
          conditionValue: z.any().optional(),
          actionType: z.enum(["batch-analyze", "batch-apply", "multi-site-analyze", "multi-site-apply", "webhook", "log"]),
          actionParams: z.record(z.any()).default({}),
        }),
        handler: async (args) => {
          const condition = args.conditionField && args.conditionOperator
            ? { field: args.conditionField, operator: args.conditionOperator, value: args.conditionValue }
            : undefined;
          const rule = rulesEngine.addRule(
            args.name,
            { type: args.triggerType, pattern: args.pattern, cron: args.cron },
            { type: args.actionType, params: args.actionParams },
            condition,
          );
          return { success: true, data: { rule } };
        },
      },
      {
        name: "automation-list-rules",
        description: "List all configured automation rules",
        inputSchema: z.object({}),
        handler: async () => ({
          success: true,
          data: { rules: rulesEngine.listRules() },
        }),
      },
      {
        name: "automation-remove-rule",
        description: "Remove an automation rule by ID",
        inputSchema: z.object({
          id: z.string().describe("Rule ID to remove"),
        }),
        handler: async (args) => {
          const removed = rulesEngine.removeRule(args.id);
          return { success: removed, data: { removed } };
        },
      },
    ],
  };
}
