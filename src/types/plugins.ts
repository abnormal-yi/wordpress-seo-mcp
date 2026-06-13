export type PluginPermission = "read" | "write" | "network";
export type PluginCapabilityAction = "analyze" | "apply";
export type PluginCapabilityResource = "meta" | "schema" | "content" | "images" | "technical";

export interface PluginCapability {
  action: PluginCapabilityAction;
  resource: PluginCapabilityResource;
  description: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  permissions: PluginPermission[];
  capabilities: PluginCapability[];
  hooks: string[];
  config: Record<string, unknown>;
}

export interface PluginContext {
  config: import("../core/config-manager").ConfigManager;
  storage: import("../services/storage").StorageEngine;
  eventBus: import("../core/event-bus").EventBus;
  logger: Console;
  makeRequest: <T>(fn: () => Promise<T>) => Promise<T>;
  cache: import("../infrastructure/cache-hierarchy").CacheHierarchy;
}

export interface AnalyzeParams {
  siteId: string;
  postId: number;
  [key: string]: unknown;
}

export interface ApplyParams {
  siteId: string;
  postId: number;
  [key: string]: unknown;
}

export interface AnalyzeResult {
  plugin: string;
  score: number;
  issues: Array<{ field: string; message: string; severity: "error" | "warning" | "info" }>;
  data: Record<string, unknown>;
}

export interface ApplyResult {
  plugin: string;
  success: boolean;
  changes: Array<{ field: string; oldValue?: string; newValue: string }>;
  error?: string;
}

export interface SEOPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  manifest: PluginManifest;
  init?(context: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
  analyze(params: AnalyzeParams): Promise<AnalyzeResult>;
  apply?(params: ApplyParams): Promise<ApplyResult>;
  onActivate?(): Promise<void>;
  onDeactivate?(): Promise<void>;
  onConfigChange?(config: Record<string, unknown>): Promise<void>;
}
