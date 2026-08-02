import { z } from "zod";
import type { ArtifactStore } from "../artifacts/artifactStore.js";
import type { AIProvider } from "../providers/aiProvider.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import type { FileWorkspaceStore } from "../workspaces/fileWorkspaceStore.js";
import { buildAgentCatalogReport } from "./agentCatalogReport.js";
import type { AgentManifest } from "./agentManifest.js";
import type { AgentRegistry } from "./agentRegistry.js";
import type { AgentRunResult } from "./agentRunResult.js";
import { runAgent } from "./agentRunner.js";
import { verifyAgentDataset, type AgentVerificationResult } from "./agentVerification.js";
import { getAgentDatasetDefinition } from "./datasets/agentDatasetRegistry.js";
import {
  runAgentDataset,
  type AgentDatasetRunResult,
} from "./datasets/agentDatasetRunner.js";

export type ProviderFactory = (model: string) => AIProvider;
export type ToolRegistryFactory = (workspaceRoot: string) => ToolRegistry;

export interface RunAgentRequest {
  agentId: string;
  input: unknown;
  model?: string;
  workspaceId?: string;
}

export interface RunAgentResponse {
  run: AgentRunResult;
  artifactId: string;
  artifactPath: string;
}

export interface VerifyAgentRequest {
  agentId: string;
  repetitions?: number;
  concurrency?: number;
  model?: string;
  workspaceId?: string;
}

export interface AgentVerificationEvidence {
  datasetRun: AgentDatasetRunResult;
  verification: AgentVerificationResult;
  artifactId: string;
  artifactPath: string;
}

export class AgentApplicationService {
  constructor(
    readonly agents: AgentRegistry,
    readonly artifacts: ArtifactStore,
    readonly workspaces: FileWorkspaceStore,
    readonly toolFactory: ToolRegistryFactory,
    readonly providerFactory: ProviderFactory,
  ) {}

  get workspaceRoot(): string {
    return this.workspaces.defaultWorkspace.rootPath;
  }

  get tools(): ToolRegistry {
    return this.toolFactory(this.workspaceRoot);
  }

  listAgents(): AgentManifest[] {
    return this.agents.list();
  }

  listTools() {
    const tools = this.tools;
    return tools.ids().map((id) => {
      const tool = tools.get(id);
      return {
        id,
        description: tool.description,
        consumerAgentIds: this.agents.list()
          .filter((manifest) => manifest.permissions.toolIds.includes(id))
          .map(({ id: agentId }) => agentId),
      };
    });
  }

  describeTool(toolId: string) {
    const tool = this.tools.get(toolId);
    return {
      id: tool.id,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema),
      outputSchema: z.toJSONSchema(tool.outputSchema),
      consumerAgentIds: this.agents.list()
        .filter((manifest) => manifest.permissions.toolIds.includes(toolId))
        .map(({ id }) => id),
    };
  }

  describeAgent(agentId: string) {
    const registration = this.agents.get(agentId);
    return {
      manifest: registration.manifest,
      inputSchema: z.toJSONSchema(registration.inputSchema),
      outputSchema: z.toJSONSchema(registration.outputSchema),
    };
  }

  inventory() {
    return buildAgentCatalogReport(this.agents, this.tools);
  }

  async run(request: RunAgentRequest): Promise<RunAgentResponse> {
    const registration = this.agents.get(request.agentId);
    const model = request.model ?? registration.manifest.defaultModel;
    const workspace = await this.workspaces.get(request.workspaceId ?? this.workspaces.defaultWorkspace.id);
    const tools = this.toolFactory(workspace.rootPath);
    const run = await runAgent(request.agentId, request.input, {
      agents: this.agents,
      tools,
      provider: this.providerFactory(model),
      workspaceRoot: workspace.rootPath,
      workspaceId: workspace.id,
      model,
    });
    const reference = await this.artifacts.saveAgentRun(run);
    return { run, artifactId: reference.id, artifactPath: reference.path };
  }

  async verify(
    request: VerifyAgentRequest,
  ): Promise<AgentVerificationEvidence[]> {
    const registration = this.agents.get(request.agentId);
    const model = request.model ?? registration.manifest.defaultModel;
    const workspace = await this.workspaces.get(request.workspaceId ?? this.workspaces.defaultWorkspace.id);
    const tools = this.toolFactory(workspace.rootPath);
    const provider = this.providerFactory(model);
    const evidence: AgentVerificationEvidence[] = [];

    for (const datasetId of registration.manifest.verification.datasetIds) {
      const dataset = getAgentDatasetDefinition(datasetId);
      const datasetRun = await runAgentDataset(
        dataset,
        this.agents,
        (agentId, input) =>
          runAgent(agentId, input, {
            agents: this.agents,
            tools,
            provider,
            workspaceRoot: workspace.rootPath,
            workspaceId: workspace.id,
            model,
          }),
        {
          repetitions: request.repetitions,
          concurrency: request.concurrency,
        },
      );
      const verification = verifyAgentDataset(registration.manifest, datasetRun);
      const reference = await this.artifacts.saveAgentDatasetRun(datasetRun);
      evidence.push({
        datasetRun,
        verification,
        artifactId: reference.id,
        artifactPath: reference.path,
      });
    }

    return evidence;
  }
}
