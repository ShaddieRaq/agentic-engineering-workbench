import { z } from "zod";
import type { ArtifactQuery, ArtifactStore } from "../artifacts/artifactStore.js";
import type { AIProvider } from "../providers/aiProvider.js";
import { exportArtifactPresentation } from "../presentation/artifactExporter.js";
import { getArtifactSource, presentArtifact } from "../presentation/artifactPresenter.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import type { FileWorkspaceStore } from "../workspaces/fileWorkspaceStore.js";
import { parseExecutionOptions } from "../orchestration/executionPolicy.js";
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
import {
  createAgentEvaluationExperiment,
  type AgentEvaluationExperiment,
} from "./evaluations/agentEvaluationExperiment.js";
import {
  buildAgentEvaluationView,
  compareAgentEvaluationViews,
  findEvaluationCase,
} from "./evaluations/agentEvaluationView.js";
import { runAgentImprovementAnalysis } from "./agentImprovement/agentImprovementAnalysis.js";
import {
  buildAgentImprovementEvidencePacket,
  type AgentImprovementObjective,
} from "./agentImprovement/agentImprovementEvidenceBuilder.js";

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

export interface AgentEvaluationEvidence {
  experiment: AgentEvaluationExperiment;
  datasets: AgentVerificationEvidence[];
  artifactId: string;
  artifactPath: string;
}

export interface AnalyzeAgentImprovementRequest {
  experimentId: string;
  model?: string;
  target?: AgentImprovementObjective["target"];
  description?: string;
  constraints?: string[];
}

export interface AgentImprovementEvidence {
  analysis: Awaited<ReturnType<typeof runAgentImprovementAnalysis>>;
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

  async presentArtifact(artifactId: string) {
    return presentArtifact(artifactId, await this.artifacts.load(artifactId));
  }

  async exportArtifact(artifactId: string, format: "json" | "markdown") {
    return exportArtifactPresentation(await this.presentArtifact(artifactId), format);
  }

  async exportRawArtifact(artifactId: string) {
    const stored = await this.artifacts.load(artifactId);
    return {
      mediaType: "application/json; charset=utf-8" as const,
      fileName: `${stored.kind}-${artifactId}-raw.json`,
      content: `${JSON.stringify(stored.artifact, null, 2)}\n`,
    };
  }

  async getArtifactSource(artifactId: string, path: string) {
    const source = getArtifactSource(await this.artifacts.load(artifactId), path);
    if (!source) throw new Error(`Saved source is not available: ${path}`);
    return source;
  }

  async listEvaluations(query: Omit<ArtifactQuery, "kind" | "succeeded"> = {}) {
    const listed = await this.artifacts.list({ ...query, kind: "agent-evaluation" });
    const experiments: AgentEvaluationExperiment[] = [];
    const rejected = [...listed.rejected];
    for (const summary of listed.artifacts) {
      try {
        const stored = await this.artifacts.load(summary.id);
        if (stored.kind !== "agent-evaluation") {
          throw new Error("Artifact is not an evaluation experiment.");
        }
        experiments.push(stored.artifact);
      } catch (error: unknown) {
        rejected.push({
          path: summary.path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { experiments, rejected };
  }

  async getEvaluation(experimentId: string) {
    const stored = await this.artifacts.load(experimentId);
    if (stored.kind !== "agent-evaluation") {
      throw new Error(`Artifact ${experimentId} is not an evaluation experiment.`);
    }
    return buildAgentEvaluationView(stored.artifact, (id) => this.artifacts.load(id));
  }

  async compareEvaluations(baselineId: string, candidateId: string) {
    return compareAgentEvaluationViews(
      await this.getEvaluation(baselineId),
      await this.getEvaluation(candidateId),
    );
  }

  async getEvaluationCase(experimentId: string, datasetId: string, datasetCaseId: string) {
    return findEvaluationCase(
      await this.getEvaluation(experimentId),
      datasetId,
      datasetCaseId,
    );
  }

  async analyzeEvaluation(
    request: AnalyzeAgentImprovementRequest,
  ): Promise<AgentImprovementEvidence> {
    const view = await this.getEvaluation(request.experimentId);
    const firstDatasetReference = view.experiment.datasets[0];
    if (!firstDatasetReference) {
      throw new Error("Evaluation has no dataset evidence.");
    }
    const storedDataset = await this.artifacts.load(
      firstDatasetReference.datasetRunArtifactId,
    );
    if (storedDataset.kind !== "agent-dataset-run") {
      throw new Error("Evaluation subject evidence is not a dataset run.");
    }
    const frozenRun = storedDataset.artifact.runs[0]?.agentRun;
    if (!frozenRun) {
      throw new Error("Evaluation subject evidence has no agent run.");
    }
    const subjectRegistration = this.agents.find(view.experiment.agentId);
    if (
      subjectRegistration &&
      JSON.stringify(subjectRegistration.manifest) !==
      JSON.stringify(frozenRun.manifest)
    ) {
      throw new Error(
        "Registered subject manifest does not match frozen evaluation evidence.",
      );
    }

    const packet = buildAgentImprovementEvidencePacket({
      view,
      subject: {
        manifest: frozenRun.manifest,
        manifestDigest: frozenRun.manifestDigest,
        ...(subjectRegistration?.revisionSurface
          ? { revisionSurface: subjectRegistration.revisionSurface }
          : {}),
      },
      objective: {
        ...(request.target ? { target: request.target } : {}),
        ...(request.description ? { description: request.description } : {}),
        ...(request.constraints ? { constraints: request.constraints } : {}),
      },
    });
    const analyst = this.agents.get("agent-improvement-analyst");
    const model = request.model ?? analyst.manifest.defaultModel;
    const analysis = await runAgentImprovementAnalysis(
      this.providerFactory(model),
      packet,
    );
    const reference = await this.artifacts.saveAgentImprovementProposal(analysis);
    return {
      analysis,
      artifactId: reference.id,
      artifactPath: reference.path,
    };
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
  ): Promise<AgentEvaluationEvidence> {
    const registration = this.agents.get(request.agentId);
    const model = request.model ?? registration.manifest.defaultModel;
    const workspace = await this.workspaces.get(request.workspaceId ?? this.workspaces.defaultWorkspace.id);
    const tools = this.toolFactory(workspace.rootPath);
    const provider = this.providerFactory(model);
    const execution = parseExecutionOptions({
      repetitions: request.repetitions,
      concurrency: request.concurrency,
    });
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
          repetitions: execution.repetitions,
          concurrency: execution.concurrency,
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

    const experiment = createAgentEvaluationExperiment({
      agentId: registration.manifest.id,
      agentVersion: registration.manifest.version,
      workspaceId: workspace.id,
      model,
      repetitions: execution.repetitions,
      concurrency: execution.concurrency,
      datasets: evidence.map(({ datasetRun, verification, artifactId }) => ({
        datasetRun,
        verification,
        artifactId,
      })),
    });
    const reference = await this.artifacts.saveAgentEvaluation(experiment);
    return {
      experiment,
      datasets: evidence,
      artifactId: reference.id,
      artifactPath: reference.path,
    };
  }
}
