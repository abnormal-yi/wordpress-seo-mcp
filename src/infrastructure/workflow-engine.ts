import { EventBus } from "../core/event-bus";

export interface WorkflowStep {
  name: string;
  execute: (context: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface Workflow {
  id: string;
  siteId: string;
  steps: WorkflowStep[];
  context: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  currentStep: number;
  error?: string;
  createdAt: number;
}

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private bus?: EventBus;

  constructor(bus?: EventBus) {
    this.bus = bus;
  }

  create(siteId: string, steps: WorkflowStep[], initialContext: Record<string, unknown> = {}): Workflow {
    const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workflow: Workflow = {
      id, siteId, steps, context: initialContext,
      status: "pending", currentStep: 0, createdAt: Date.now(),
    };
    this.workflows.set(id, workflow);
    return workflow;
  }

  async execute(id: string): Promise<Workflow> {
    const workflow = this.workflows.get(id);
    if (!workflow) throw new Error(`Workflow ${id} not found`);
    workflow.status = "running";

    for (let i = workflow.currentStep; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      workflow.currentStep = i;
      try {
        workflow.context = await step.execute(workflow.context);
      } catch (err) {
        workflow.status = "failed";
        workflow.error = String(err);
        this.bus?.emit("apply:failed", { workflowId: id, step: step.name, error: String(err) });
        return workflow;
      }
    }

    workflow.status = "completed";
    this.bus?.emit("apply:complete", { workflowId: id });
    return workflow;
  }

  get(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  list(siteId?: string): Workflow[] {
    const all = Array.from(this.workflows.values());
    return siteId ? all.filter((w) => w.siteId === siteId) : all;
  }
}
