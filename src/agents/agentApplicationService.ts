import { z } from "zod";
import type { ArtifactStore } from "../artifacts/artifactStore.js";
import type { AIProvider } from "../providers/aiProvider.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
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

export interface RunAgentRequest {
  agentId: string;
  input: unknown;
  model?: string;
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
    readonly tools: ToolRegistry,
    readonly artifacts: ArtifactStore,
    readonly workspaceRoot: string,
    readonly providerFactory: ProviderFactory,
  ) {}

  listAgents(): AgentManifest[] {
    return this.agents.list();
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
    const run = await runAgent(request.agentId, request.input, {
      agents: this.agents,
      tools: this.tools,
      provider: this.providerFactory(model),
      workspaceRoot: this.workspaceRoot,
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
            tools: this.tools,
            provider,
            workspaceRoot: this.workspaceRoot,
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
