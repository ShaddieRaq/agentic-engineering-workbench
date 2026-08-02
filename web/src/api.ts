export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  status: "experimental" | "active" | "deprecated" | "retired";
  description: string;
  owner: string;
  tags: string[];
  defaultModel: string;
  components: {
    workflowIds: string[];
    harnessIds: string[];
    scenarioIds: string[];
    datasetIds: string[];
  };
  permissions: { toolIds: string[] };
  verification: { datasetIds: string[]; minimumPassRate: number | null };
}

export interface Health {
  status: string;
  apiKeyConfigured: boolean;
  workspaceRoot: string;
  catalogValid: boolean;
}

export interface AgentDescription {
  manifest: AgentManifest;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ArtifactSummary {
  id: string;
  kind: "agent-run" | "agent-dataset-run";
  path: string;
  agentId: string;
  agentVersion: string;
  workspaceId: string | null;
  completedAt: string;
  succeeded: boolean | null;
}

export interface WorkspaceDefinition {
  id: string;
  name: string;
  rootPath: string;
  addedAt: string;
  builtIn: boolean;
}

export interface ToolSummary {
  id: string;
  description: string;
  consumerAgentIds: string[];
}

export interface ToolDescription extends ToolSummary {
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export interface ArtifactList {
  artifacts: ArtifactSummary[];
  rejected: Array<{ path: string; reason: string }>;
}

export interface OperationEvent {
  sequence: number;
  stage: string;
  message: string;
  occurredAt: string;
}

export interface Operation {
  operationId: string;
  kind: "agent-run" | "agent-verification";
  agentId: string;
  status: "queued" | "running" | "completed" | "failed";
  events: OperationEvent[];
  result: unknown | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface VerificationEvidence {
  artifactId: string;
  artifactPath: string;
  verification: {
    agentId: string;
    agentVersion: string;
    datasetId: string;
    minimumPassRate: number | null;
    passed: boolean;
    failedCaseIds: string[];
  };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const body = (text ? JSON.parse(text) : undefined) as T | { error?: string } | undefined;
  if (!response.ok) {
    throw new Error((body as { error?: string } | undefined)?.error ?? `Request failed: ${response.status}`);
  }
  return body as T;
}
