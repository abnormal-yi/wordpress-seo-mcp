import Database from "better-sqlite3";
import { EventBus } from "../core/event-bus";

export interface RuleCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
}

export interface RuleAction {
  type: "batch-analyze" | "batch-apply" | "multi-site-analyze" | "multi-site-apply" | "webhook" | "log";
  params: Record<string, unknown>;
}

export interface RuleTrigger {
  type: "event" | "schedule";
  pattern?: string;
  cron?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  condition?: RuleCondition;
  action: RuleAction;
  createdAt: number;
  updatedAt: number;
}

export class RulesEngine {
  private rules: Map<string, Rule> = new Map();
  private bus: EventBus;
  private db: Database.Database;

  constructor(db: Database.Database, bus: EventBus) {
    this.db = db;
    this.bus = bus;
    this.loadRules();
    this.bus.on("**", (event) => this.handleEvent(event));
  }

  private loadRules(): void {
    const rows = this.db.prepare("SELECT * FROM automation_rules WHERE enabled = 1").all() as any[];
    for (const row of rows) {
      this.rules.set(row.id, {
        id: row.id,
        name: row.name,
        enabled: !!row.enabled,
        trigger: JSON.parse(row.trigger_json),
        condition: row.condition_json ? JSON.parse(row.condition_json) : undefined,
        action: JSON.parse(row.action_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  }

  addRule(name: string, trigger: RuleTrigger, action: RuleAction, condition?: RuleCondition): Rule {
    const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const rule: Rule = { id, name, enabled: true, trigger, condition, action, createdAt: now, updatedAt: now };
    this.db.prepare(
      "INSERT INTO automation_rules (id, name, enabled, trigger_json, condition_json, action_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, name, 1, JSON.stringify(trigger), condition ? JSON.stringify(condition) : null, JSON.stringify(action), now, now);
    this.rules.set(id, rule);
    return rule;
  }

  removeRule(id: string): boolean {
    this.db.prepare("DELETE FROM automation_rules WHERE id = ?").run(id);
    return this.rules.delete(id);
  }

  listRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  private handleEvent(event: { type: string; payload: unknown; metadata: { siteId?: string } }): void {
    for (const rule of this.rules.values()) {
      if (rule.trigger.type !== "event") continue;
      if (rule.trigger.pattern) {
        const regex = new RegExp("^" + rule.trigger.pattern.replace(/\*/g, ".*") + "$");
        if (!regex.test(event.type)) continue;
      }
      if (rule.condition && !this.evaluateCondition(rule.condition, event.payload)) continue;
      this.dispatchAction(rule.action, event);
    }
  }

  private evaluateCondition(condition: RuleCondition, payload: unknown): boolean {
    const value = (payload as Record<string, unknown>)[condition.field];
    switch (condition.operator) {
      case "eq": return value === condition.value;
      case "neq": return value !== condition.value;
      case "gt": return typeof value === "number" && typeof condition.value === "number" && value > condition.value;
      case "gte": return typeof value === "number" && typeof condition.value === "number" && value >= condition.value;
      case "lt": return typeof value === "number" && typeof condition.value === "number" && value < condition.value;
      case "lte": return typeof value === "number" && typeof condition.value === "number" && value <= condition.value;
      default: return false;
    }
  }

  private dispatchAction(action: RuleAction, event: { type: string; payload: unknown; metadata: { siteId?: string } }): void {
    console.log(`[RulesEngine] Triggered ${action.type} by event ${event.type}`);
    // Action dispatch is handled by the caller (tools will be invoked via MCP)
    // For now, log to audit and emit a trigger event
  }
}
