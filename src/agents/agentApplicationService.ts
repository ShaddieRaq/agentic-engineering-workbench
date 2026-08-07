import { z } from "zod";
import {
  persistAgentCandidateEvaluation,
} from "../artifacts/agentCandidateEvaluationPersistence.js";
import type { ArtifactQuery, ArtifactStore } from "../artifacts/artifactStore.js";
import type { AIProvider } from "../providers/aiProvider.js";
import { exportArtifactPresentation } from "../presentation/artifactExporter.js";
import { getArtifactSource, presentArtifact } from "../presentation/artifactPresenter.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import type { FileWorkspaceStore } from "../workspaces/fileWorkspaceStore.js";
import { parseExecutionOptions } from "../orchestration/executionPolicy.js";
import { buildAgentCatalogReport } from "./agentCatalogReport.js";
import { digestJsonEvidence } from "./agentEvidenceDigest.js";
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
import { validateCandidatePolicyPatch } from "./agentImprovement/agentCandidateBuilder.js";
import { buildAgentCandidate } from "./agentImprovement/agentCandidateBuilder.js";
import {
  buildAgentImprovementEvidencePacket,
  type AgentImprovementObjective,
} from "./agentImprovement/agentImprovementEvidenceBuilder.js";
import type { AgentCandidateEvaluationArtifact } from "./evaluations/agentCandidateEvaluationArtifact.js";
import {
  createFrozenAgentCandidateEvaluationPlan,
} from "./evaluations/agentCandidateEvaluationPlan.js";
import {
  runFrozenAgentCandidateEvaluation,
} from "./evaluations/agentCandidateEvaluationRunner.js";
import { toolBuilderInputSchema } from "./toolBuilder/toolBuilderAgent.js";
import {
  createAgentPromotionDecision,
  type AgentPromotionDecision,
  type AgentPromotionDecisionKind,
} from "./evaluations/agentPromotionDecision.js";

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

export interface AgentCandidateEvaluationEvidence {
  evaluation: AgentCandidateEvaluationArtifact;
  artifactId: string;
  artifactPath: string;
  baselineEvaluationArtifactId: string;
  candidateEvaluationArtifactId: string;
  datasetRunArtifactIds: string[];
}

export interface ToolBuilderHandoffRequest {
  proposalArtifactId: string;
  recommendationIndex: number;
}

export interface ChangeRiskReviewerHandoffRequest {
  proposalArtifactId: string;
  recommendationIndex: number;
  toolBuilderRunArtifactId?: string;
}

export interface RecordPromotionDecisionRequest {
  candidateEvaluationId: string;
  decision: AgentPromotionDecisionKind;
  operatorId: string;
  rationale: string;
  proposalArtifactId?: string | null;
}

export interface PromotionDecisionEvidence {
  decision: AgentPromotionDecision;
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

  async getCandidateEvaluation(
    candidateEvaluationId: string,
  ): Promise<AgentCandidateEvaluationArtifact> {
    const stored = await this.artifacts.load(candidateEvaluationId);
    if (stored.kind !== "agent-candidate-evaluation") {
      throw new Error(
        `Artifact ${candidateEvaluationId} is not a candidate evaluation.`,
      );
    }
    return stored.artifact;
  }

  async handoffImprovementToToolBuilder(
    request: ToolBuilderHandoffRequest,
  ): Promise<RunAgentResponse> {
    if (
      !Number.isInteger(request.recommendationIndex) ||
      request.recommendationIndex < 0
    ) {
      throw new Error(
        "Tool Builder handoff recommendation index must be a nonnegative integer.",
      );
    }
    const stored = await this.artifacts.load(request.proposalArtifactId);
    if (stored.kind !== "agent-improvement-proposal") {
      throw new Error(
        `Artifact ${request.proposalArtifactId} is not an improvement proposal.`,
      );
    }
    const analysis = stored.artifact;
    if (
      !analysis.succeeded ||
      analysis.parsedOutput === null ||
      analysis.policyEvaluation?.passed !== true
    ) {
      throw new Error(
        "Only a successful, policy-valid improvement proposal can create a Tool Builder handoff.",
      );
    }
    if (analysis.parsedOutput.disposition !== "engineering-change-required") {
      throw new Error(
        "Only an engineering-change-required proposal can create a Tool Builder handoff.",
      );
    }
    const recommendation =
      analysis.parsedOutput.recommendations[request.recommendationIndex];
    if (!recommendation) {
      throw new Error(
        `Improvement recommendation index is out of range: ${request.recommendationIndex}.`,
      );
    }
    if (
      recommendation.category === "no-change" ||
      recommendation.evidenceIds.length === 0
    ) {
      throw new Error(
        "Change Risk handoff requires an engineering recommendation with cited evidence.",
      );
    }
    if (recommendation.category !== "tool-capability") {
      throw new Error(
        "Only a tool-capability recommendation can create a Tool Builder handoff.",
      );
    }
    const evidenceById = new Map(
      analysis.packet.evidenceItems.map((item) => [item.id, item]),
    );
    const citedEvidence = recommendation.evidenceIds.map((evidenceId) => {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        throw new Error(
          `Tool Builder handoff cites unavailable evidence: ${evidenceId}.`,
        );
      }
      return evidence;
    });
    const subject = analysis.packet.subject;
    const toolRequest = [
      `Subject agent: ${subject.agentId}@${subject.agentVersion}`,
      `Capability recommendation: ${recommendation.title}`,
      `Rationale: ${recommendation.rationale}`,
      `Requested change: ${recommendation.proposedChange}`,
      "Cited improvement evidence:",
      ...citedEvidence.map(
        ({ id, summary }) => `- ${id}: ${summary}`,
      ),
    ].join("\n");

    return this.run({
      agentId: "tool-builder",
      workspaceId: analysis.packet.execution.workspaceId,
      input: {
        request: toolRequest,
        allowSideEffects: false,
        additionalConstraints: [
          ...analysis.packet.objective.constraints,
        ],
        sourceImprovement: {
          artifactId: request.proposalArtifactId,
          recommendationIndex: request.recommendationIndex,
        },
      },
    });
  }

  async handoffImprovementToChangeRiskReviewer(
    request: ChangeRiskReviewerHandoffRequest,
  ): Promise<RunAgentResponse> {
    if (
      !Number.isInteger(request.recommendationIndex) ||
      request.recommendationIndex < 0
    ) {
      throw new Error(
        "Change Risk handoff recommendation index must be a nonnegative integer.",
      );
    }
    const stored = await this.artifacts.load(request.proposalArtifactId);
    if (stored.kind !== "agent-improvement-proposal") {
      throw new Error(
        `Artifact ${request.proposalArtifactId} is not an improvement proposal.`,
      );
    }
    const analysis = stored.artifact;
    if (
      !analysis.succeeded ||
      analysis.parsedOutput === null ||
      analysis.policyEvaluation?.passed !== true
    ) {
      throw new Error(
        "Only a successful, policy-valid improvement proposal can create a Change Risk handoff.",
      );
    }
    if (analysis.parsedOutput.disposition !== "engineering-change-required") {
      throw new Error(
        "Only an engineering-change-required proposal can create a Change Risk handoff.",
      );
    }
    const recommendation =
      analysis.parsedOutput.recommendations[request.recommendationIndex];
    if (!recommendation) {
      throw new Error(
        `Improvement recommendation index is out of range: ${request.recommendationIndex}.`,
      );
    }
    const availableEvidenceIds = new Set(
      analysis.packet.evidenceItems.map(({ id }) => id),
    );
    const missingEvidenceId = recommendation.evidenceIds.find(
      (evidenceId) => !availableEvidenceIds.has(evidenceId),
    );
    if (missingEvidenceId) {
      throw new Error(
        `Change Risk handoff cites unavailable evidence: ${missingEvidenceId}.`,
      );
    }

    if (request.toolBuilderRunArtifactId) {
      const toolBuilderStored = await this.artifacts.load(
        request.toolBuilderRunArtifactId,
      );
      if (
        toolBuilderStored.kind !== "agent-run" ||
        toolBuilderStored.artifact.agentId !== "tool-builder" ||
        !toolBuilderStored.artifact.succeeded
      ) {
        throw new Error(
          "Linked Tool Builder artifact must be a successful Tool Builder run.",
        );
      }
      const toolBuilderInput = toolBuilderInputSchema.safeParse(
        toolBuilderStored.artifact.input,
      );
      if (
        !toolBuilderInput.success ||
        toolBuilderInput.data.sourceImprovement?.artifactId !==
          request.proposalArtifactId ||
        toolBuilderInput.data.sourceImprovement.recommendationIndex !==
          request.recommendationIndex ||
        toolBuilderStored.artifact.configuration.workspaceId !==
          analysis.packet.execution.workspaceId
      ) {
        throw new Error(
          "Linked Tool Builder run does not match the improvement handoff lineage.",
        );
      }
    }

    return this.run({
      agentId: "change-risk-reviewer",
      workspaceId: analysis.packet.execution.workspaceId,
      input: {
        instruction: [
          `Review the actual current workspace changes for ${analysis.packet.subject.agentId}@${analysis.packet.subject.agentVersion}.`,
          `Improvement recommendation: ${recommendation.title}`,
          `Rationale: ${recommendation.rationale}`,
          `Intended change: ${recommendation.proposedChange}`,
          "Determine whether the observed diff plausibly implements this recommendation and identify concrete risks and missing tests.",
          "Do not assume that proposal text or a Tool Builder output was applied; use only current workspace evidence.",
        ].join("\n"),
        sourceImprovement: {
          artifactId: request.proposalArtifactId,
          recommendationIndex: request.recommendationIndex,
          ...(request.toolBuilderRunArtifactId
            ? {
                toolBuilderRunArtifactId:
                  request.toolBuilderRunArtifactId,
              }
            : {}),
        },
      },
    });
  }

  async evaluateImprovementProposal(
    proposalArtifactId: string,
  ): Promise<AgentCandidateEvaluationEvidence> {
    const stored = await this.artifacts.load(proposalArtifactId);
    if (stored.kind !== "agent-improvement-proposal") {
      throw new Error(
        `Artifact ${proposalArtifactId} is not an improvement proposal.`,
      );
    }
    const analysis = stored.artifact;
    if (
      !analysis.succeeded ||
      analysis.parsedOutput === null ||
      analysis.policyEvaluation?.passed !== true
    ) {
      throw new Error(
        "Only a successful, policy-valid improvement proposal can be evaluated.",
      );
    }
    if (
      analysis.parsedOutput.disposition !== "candidate-ready" ||
      analysis.parsedOutput.candidatePolicyPatch === null
    ) {
      throw new Error(
        "Only a candidate-ready improvement proposal can be evaluated.",
      );
    }

    const registration = this.agents.get(analysis.packet.subject.agentId);
    if (
      registration.manifest.version !==
        analysis.packet.subject.agentVersion ||
      digestJsonEvidence(registration.manifest) !==
        analysis.packet.subject.manifestDigest
    ) {
      throw new Error(
        "Registered subject manifest does not match the improvement proposal.",
      );
    }
    const workspace = await this.workspaces.get(
      analysis.packet.execution.workspaceId,
    );
    const candidate = buildAgentCandidate({
      registration,
      packet: analysis.packet,
      proposal: analysis.parsedOutput,
      proposalId: proposalArtifactId,
    });
    const datasets = registration.manifest.verification.datasetIds.map(
      (datasetId) => getAgentDatasetDefinition(datasetId),
    );
    const plan = createFrozenAgentCandidateEvaluationPlan({
      baselineRegistration: registration,
      candidate,
      datasets,
      workspaceId: workspace.id,
      model: analysis.packet.execution.model,
      execution: {
        repetitions: analysis.packet.execution.repetitions,
        concurrency: analysis.packet.execution.concurrency,
      },
    });
    const execution = await runFrozenAgentCandidateEvaluation({
      plan,
      tools: this.toolFactory(workspace.rootPath),
      providerFactory: this.providerFactory,
      workspaceRoot: workspace.rootPath,
    });
    const persisted = await persistAgentCandidateEvaluation(
      this.artifacts,
      execution,
    );
    return {
      evaluation: persisted.artifact,
      artifactId: persisted.reference.id,
      artifactPath: persisted.reference.path,
      baselineEvaluationArtifactId:
        persisted.baselineEvaluationReference.id,
      candidateEvaluationArtifactId:
        persisted.candidateEvaluationReference.id,
      datasetRunArtifactIds: persisted.datasetRunReferences.map(
        ({ id }) => id,
      ),
    };
  }

  async recordPromotionDecision(
    request: RecordPromotionDecisionRequest,
  ): Promise<PromotionDecisionEvidence> {
    const comparison = await this.getCandidateEvaluation(
      request.candidateEvaluationId,
    );
    if (request.proposalArtifactId) {
      if (
        request.proposalArtifactId !== comparison.plan.candidate.proposalId
      ) {
        throw new Error(
          "Improvement proposal does not match the candidate comparison lineage.",
        );
      }
      const proposal = await this.artifacts.load(request.proposalArtifactId);
      if (proposal.kind !== "agent-improvement-proposal") {
        throw new Error(
          `Artifact ${request.proposalArtifactId} is not an improvement proposal.`,
        );
      }
      if (
        proposal.artifact.packet.subject.agentId !==
          comparison.plan.subject.agentId ||
        proposal.artifact.packet.subject.agentVersion !==
          comparison.plan.subject.agentVersion
      ) {
        throw new Error(
          "Improvement proposal subject does not match the candidate comparison.",
        );
      }
    }

    let decision: AgentPromotionDecision;
    try {
      decision = createAgentPromotionDecision({
        comparison,
        decision: request.decision,
        operatorId: request.operatorId,
        rationale: request.rationale,
        proposalArtifactId: request.proposalArtifactId ?? null,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw new Error(z.prettifyError(error));
      }
      throw error;
    }
    const reference = await this.artifacts.saveAgentPromotionDecision(decision);
    return {
      decision,
      artifactId: reference.id,
      artifactPath: reference.path,
    };
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
      subjectRegistration?.revisionSurface
        ? {
            validateCandidatePolicy: (patch) =>
              validateCandidatePolicyPatch(
                subjectRegistration.revisionSurface!,
                patch,
              ),
          }
        : {},
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
