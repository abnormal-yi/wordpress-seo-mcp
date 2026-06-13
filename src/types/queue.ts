export type JobType = "analyze" | "apply" | "rollback" | "sitemap" | "monitor" | "auto-fix" | "batch-analyze" | "batch-apply" | "meta";
export type JobPriority = "high" | "medium" | "low";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  type: JobType;
  siteId: string;
  payload: Record<string, unknown>;
  priority: JobPriority;
  status: JobStatus;
  retryCount: number;
  maxRetries: number;
  schedule?: string;
  correlationId: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface JobRow {
  id: string;
  type: JobType;
  site_id: string;
  payload: string;
  priority: string;
  status: string;
  retry_count: number;
  max_retries: number;
  schedule: string | null;
  correlation_id: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export type QueueLane = "high" | "medium" | "low";
export type WorkerCallback = (job: Job) => Promise<void>;
