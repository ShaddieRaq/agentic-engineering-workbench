import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { AgentRegistry } from "../agents/agentRegistry.js";
import type { ArtifactListResult, StoredArtifact } from "../artifacts/artifactStore.js";
import type { FileArtifactStore } from "../artifacts/fileArtifactStore.js";
import { importExportFeedback } from "../foundry/exportFeedback.js";
import type {
  FoundryArtifactKind,
  FoundryArtifactListResult,
  FoundryArtifactStore,
  FoundryStoredArtifact,
} from "../foundry/foundryArtifactStore.js";
import type { ArchitectService } from "../foundry/architectService.js";
import type { CapabilityService } from "../foundry/capabilityService.js";
import type {
  IntakeSessionController,
  IntakeTurnResult,
} from "../foundry/intakeSessionController.js";
import type { ProjectBriefService } from "../foundry/projectBriefService.js";
import type { BuildCompletionService } from "../foundry/buildCompletionService.js";
import type { SubmissionService } from "../foundry/submissionService.js";
import type { TestDesignService } from "../foundry/testDesignService.js";
import type { WorkOrderService } from "../foundry/workOrderService.js";

// Structural subsets of AgentApplicationService so tests can inject scripted
// fakes without provider construction (precedent: IntakeAgentRunService).
export interface McpAgentRunner {
  run(request: { agentId: string; input: unknown; model?: string }): Promise<{
    run: {
      succeeded: boolean;
      output: unknown;
      failure: { message: string } | null;
      assessment: { passed: boolean; message: string } | null;
    };
    artifactId: string;
    artifactPath: string;
  }>;
}

export interface McpPromotionDecisionService {
  recordPromotionDecision(request: {
    candidateEvaluationId: string;
    decision: "approve" | "reject" | "revise";
    operatorId: string;
    rationale: string;
    proposalArtifactId?: string;
  }): Promise<{ decision: unknown; artifactId: string }>;
}

export interface WorkbenchMcpDependencies {
  agents: AgentRegistry;
  artifacts: FileArtifactStore;
  foundry: FoundryArtifactStore;
  exportsRoot: string;
  agentRunner: McpAgentRunner;
  promotionDecisions: McpPromotionDecisionService;
  intake: Pick<IntakeSessionController, "startIntake" | "runTurn" | "status">;
  briefs: Pick<ProjectBriefService, "recordDecision">;
  architect: Pick<ArchitectService, "createPlan" | "recordPlanDecision">;
  capability: Pick<
    CapabilityService,
    "createCapabilityPlan" | "recordCapabilityDecision"
  >;
  testDesign: Pick<
    TestDesignService,
    "createTestSuite" | "recordTestSuiteDecision"
  >;
  workOrders: Pick<
    WorkOrderService,
    "createWorkOrder" | "nextSlice" | "materializeVisibleTests" | "loadWorkOrder"
  >;
  suiteReads: Pick<TestDesignService, "loadTestSuite">;
  submissions: Pick<
    SubmissionService,
    "submitSlice" | "recordSubmissionDecision"
  >;
  completions: Pick<BuildCompletionService, "recordCompletion">;
}

function intakeTurnView(result: IntakeTurnResult) {
  return {
    briefId: result.brief.briefId,
    briefVersion: result.brief.version,
    turnNumber: result.record.turnNumber,
    maxTurns: result.record.maxTurns,
    status: result.record.status,
    nextQuestions: result.record.nextQuestions,
    openIssues: result.record.openIssues,
    reconciliation: result.reconciliation,
  };
}

export interface ExportedPackageFile {
  relativePath: string;
  content: string;
}

const exportablePackages: Record<string, Record<string, string>> = {
  "project-intake": { "claude-code": "claude-code/project-intake" },
};

async function collectFiles(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];
  for (const entry of entries.sort()) {
    const path = join(directory, entry);
    const metadata = await stat(path);
    if (metadata.isDirectory()) {
      files.push(...(await collectFiles(root, path)));
    } else if (metadata.isFile()) {
      files.push(path);
    }
  }
  return files;
}

export function createWorkbenchMcpTools(deps: WorkbenchMcpDependencies) {
  return {
    async listAgents(): Promise<
      { id: string; version: string; status: string; description: string }[]
    > {
      return deps.agents.list().map((manifest) => ({
        id: manifest.id,
        version: manifest.version,
        status: manifest.status,
        description: manifest.description,
      }));
    },

    async describeAgent(input: { agentId: string }) {
      return deps.agents.get(input.agentId).manifest;
    },

    async listArtifacts(input: {
      source: "runs" | "foundry";
      kind?: string | undefined;
      agentId?: string | undefined;
      briefId?: string | undefined;
      limit?: number | undefined;
    }): Promise<ArtifactListResult | FoundryArtifactListResult> {
      if (input.source === "runs") {
        return deps.artifacts.list({
          ...(input.kind ? { kind: input.kind as never } : {}),
          ...(input.agentId ? { agentId: input.agentId } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        });
      }
      return deps.foundry.list({
        ...(input.kind ? { kind: input.kind as FoundryArtifactKind } : {}),
        ...(input.briefId ? { briefId: input.briefId } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      });
    },

    async getArtifact(input: {
      source: "runs" | "foundry";
      artifactId: string;
    }): Promise<StoredArtifact | FoundryStoredArtifact> {
      return input.source === "runs"
        ? deps.artifacts.load(input.artifactId)
        : deps.foundry.load(input.artifactId);
    },

    async submitFeedback(input: {
      bundleJson: string;
      exportDirectory?: string | undefined;
    }) {
      const bundle: unknown = JSON.parse(input.bundleJson);
      const exportDirectory = resolve(
        input.exportDirectory ?? join(deps.exportsRoot, "claude-code/project-intake"),
      );
      const provenance: unknown = JSON.parse(
        await readFile(join(exportDirectory, "provenance.json"), "utf8"),
      );
      const record = importExportFeedback({ bundle, provenance });
      const reference = await deps.foundry.saveExportFeedback(record);

      return {
        feedbackId: record.feedbackId,
        exportId: record.exportId,
        subject: record.subject,
        provenanceVerified: record.provenanceVerified,
        artifactPath: reference.path,
        issuesObserved: record.bundle.issuesObserved,
        observations: record.bundle.observations,
      };
    },

    async runAgent(input: {
      agentId: string;
      inputJson: string;
      model?: string | undefined;
    }) {
      const parsed: unknown = JSON.parse(input.inputJson);
      const response = await deps.agentRunner.run({
        agentId: input.agentId,
        input: parsed,
        ...(input.model ? { model: input.model } : {}),
      });
      return {
        agentId: input.agentId,
        succeeded: response.run.succeeded,
        assessment: response.run.assessment,
        failure: response.run.failure,
        artifactId: response.artifactId,
        artifactPath: response.artifactPath,
        output: response.run.output,
      };
    },

    async intakeStart(input: {
      title: string;
      idea: string;
      maxTurns?: number | undefined;
    }) {
      const result = await deps.intake.startIntake({
        title: input.title,
        idea: input.idea,
        ...(input.maxTurns !== undefined ? { maxTurns: input.maxTurns } : {}),
      });
      return intakeTurnView(result);
    },

    async intakeTurn(input: {
      briefId: string;
      answers: { questionId: string | null; answer: string }[];
    }) {
      const result = await deps.intake.runTurn({
        briefId: input.briefId,
        answers: input.answers,
      });
      return intakeTurnView(result);
    },

    async intakeStatus(input: { briefId: string }) {
      return deps.intake.status(input.briefId);
    },

    async recordBriefDecision(input: {
      briefId: string;
      version: number;
      decision: "approve" | "reject" | "revise" | "reopen";
      operatorId: string;
      rationale: string;
      requestedRevisions?: string[] | undefined;
    }) {
      const saved = await deps.briefs.recordDecision({
        briefId: input.briefId,
        version: input.version,
        decision: input.decision,
        operatorId: input.operatorId,
        rationale: input.rationale,
        requestedRevisions:
          input.requestedRevisions && input.requestedRevisions.length > 0
            ? input.requestedRevisions
            : null,
      });
      return { decision: saved.decision, artifactPath: saved.reference.path };
    },

    async architectPlan(input: {
      briefId: string;
      model?: string | undefined;
      reviseFromId?: string | undefined;
      evolvesFromCompletionId?: string | undefined;
    }) {
      const saved = await deps.architect.createPlan({
        briefId: input.briefId,
        ...(input.model ? { model: input.model } : {}),
        ...(input.reviseFromId ? { reviseFromId: input.reviseFromId } : {}),
        ...(input.evolvesFromCompletionId
          ? { evolvesFromCompletionId: input.evolvesFromCompletionId }
          : {}),
      });
      return {
        planId: saved.plan.planId,
        briefId: saved.plan.briefId,
        briefVersion: saved.plan.briefVersion,
        content: saved.plan.content,
        reconciliation: saved.plan.reconciliation,
        artifactPath: saved.reference.path,
      };
    },

    async recordPlanDecision(input: {
      planId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions?: string[] | undefined;
    }) {
      const saved = await deps.architect.recordPlanDecision({
        planId: input.planId,
        decision: input.decision,
        operatorId: input.operatorId,
        rationale: input.rationale,
        requestedRevisions:
          input.requestedRevisions && input.requestedRevisions.length > 0
            ? input.requestedRevisions
            : null,
      });
      return { decision: saved.decision, artifactPath: saved.reference.path };
    },

    async capabilityPlan(input: {
      planId: string;
      model?: string | undefined;
      reviseFromId?: string | undefined;
    }) {
      const saved = await deps.capability.createCapabilityPlan({
        planId: input.planId,
        ...(input.model ? { model: input.model } : {}),
        ...(input.reviseFromId ? { reviseFromId: input.reviseFromId } : {}),
      });
      return {
        capabilityPlanId: saved.capabilityPlan.capabilityPlanId,
        planId: saved.capabilityPlan.planId,
        briefId: saved.capabilityPlan.briefId,
        content: saved.capabilityPlan.content,
        reconciliation: saved.capabilityPlan.reconciliation,
        artifactPath: saved.reference.path,
      };
    },

    async recordCapabilityDecision(input: {
      capabilityPlanId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions?: string[] | undefined;
    }) {
      const saved = await deps.capability.recordCapabilityDecision({
        capabilityPlanId: input.capabilityPlanId,
        decision: input.decision,
        operatorId: input.operatorId,
        rationale: input.rationale,
        requestedRevisions:
          input.requestedRevisions && input.requestedRevisions.length > 0
            ? input.requestedRevisions
            : null,
      });
      return { decision: saved.decision, artifactPath: saved.reference.path };
    },

    async designTests(input: {
      capabilityPlanId: string;
      model?: string | undefined;
      reviseFromId?: string | undefined;
    }) {
      const saved = await deps.testDesign.createTestSuite({
        capabilityPlanId: input.capabilityPlanId,
        ...(input.model ? { model: input.model } : {}),
        ...(input.reviseFromId ? { reviseFromId: input.reviseFromId } : {}),
      });
      return {
        testSuiteId: saved.testSuite.testSuiteId,
        capabilityPlanId: saved.testSuite.capabilityPlanId,
        briefId: saved.testSuite.briefId,
        content: saved.testSuite.content,
        reconciliation: saved.testSuite.reconciliation,
        artifactPath: saved.reference.path,
      };
    },

    async recordTestDecision(input: {
      testSuiteId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions?: string[] | undefined;
    }) {
      const saved = await deps.testDesign.recordTestSuiteDecision({
        testSuiteId: input.testSuiteId,
        decision: input.decision,
        operatorId: input.operatorId,
        rationale: input.rationale,
        requestedRevisions:
          input.requestedRevisions && input.requestedRevisions.length > 0
            ? input.requestedRevisions
            : null,
      });
      return { decision: saved.decision, artifactPath: saved.reference.path };
    },

    async createWorkOrder(input: {
      testSuiteId: string;
      sliceId?: string | undefined;
    }) {
      let sliceId = input.sliceId;
      if (!sliceId) {
        const next = await deps.workOrders.nextSlice({
          testSuiteId: input.testSuiteId,
        });
        if (!next) {
          return { done: true, message: "Every slice has an approved submission." };
        }
        sliceId = next.sliceId;
      }
      const saved = await deps.workOrders.createWorkOrder({
        testSuiteId: input.testSuiteId,
        sliceId,
      });
      return { workOrder: saved.workOrder, artifactPath: saved.reference.path };
    },

    async materializeTests(input: {
      workOrderId: string;
      projectRoot: string;
    }) {
      const written = await deps.workOrders.materializeVisibleTests({
        workOrderId: input.workOrderId,
        projectRoot: input.projectRoot,
      });
      return { written };
    },

    async prepareBuilderWorkspace(input: {
      workOrderId: string;
      projectRoot: string;
    }) {
      const { prepareBuilderWorkspace } = await import(
        "../foundry/builderWorkspace.js"
      );
      const prepared = await prepareBuilderWorkspace(
        { workOrders: deps.workOrders, testDesign: deps.suiteReads },
        {
          workOrderId: input.workOrderId,
          projectRoot: input.projectRoot,
          workbenchRoot: process.cwd(),
        },
      );
      return prepared;
    },

    async submitSlice(input: { workOrderId: string; projectRoot: string }) {
      const saved = await deps.submissions.submitSlice({
        workOrderId: input.workOrderId,
        projectRoot: input.projectRoot,
      });
      return {
        submission: saved.submission,
        artifactPath: saved.reference.path,
      };
    },

    async recordBuildCompletion(input: {
      testSuiteId: string;
      projectRoot: string;
      operatorId: string;
      retroactive?: boolean | undefined;
    }) {
      const saved = await deps.completions.recordCompletion({
        testSuiteId: input.testSuiteId,
        projectRoot: input.projectRoot,
        operatorId: input.operatorId,
        retroactive: input.retroactive ?? false,
      });
      // Redacted projection: holdout paths are aliased in the tool result
      // just as submission evidence aliases them for the builder channel.
      const files = saved.completion.verification.files.map((file, index) =>
        file.visibility === "holdout"
          ? { ...file, path: `holdout-${index + 1}` }
          : file,
      );
      return {
        completion: {
          ...saved.completion,
          verification: { ...saved.completion.verification, files },
        },
        artifactPath: saved.reference.path,
      };
    },

    async recordSubmissionDecision(input: {
      submissionId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions?: string[] | undefined;
    }) {
      const saved = await deps.submissions.recordSubmissionDecision({
        submissionId: input.submissionId,
        decision: input.decision,
        operatorId: input.operatorId,
        rationale: input.rationale,
        requestedRevisions:
          input.requestedRevisions && input.requestedRevisions.length > 0
            ? input.requestedRevisions
            : null,
      });
      return { decision: saved.decision, artifactPath: saved.reference.path };
    },

    async recordPromotionDecision(input: {
      candidateEvaluationId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      proposalArtifactId?: string | undefined;
    }) {
      return deps.promotionDecisions.recordPromotionDecision({
        candidateEvaluationId: input.candidateEvaluationId,
        decision: input.decision,
        operatorId: input.operatorId,
        rationale: input.rationale,
        ...(input.proposalArtifactId
          ? { proposalArtifactId: input.proposalArtifactId }
          : {}),
      });
    },

    async getApprovedExport(input: {
      agentId: string;
      target: "claude-code";
    }): Promise<{
      agentId: string;
      target: string;
      files: ExportedPackageFile[];
      installInstructions: string;
    }> {
      const packagePath = exportablePackages[input.agentId]?.[input.target];
      if (!packagePath) {
        throw new Error(
          `No approved ${input.target} export exists for ${input.agentId}. ` +
            `Exportable: ${Object.keys(exportablePackages).join(", ")}.`,
        );
      }

      const root = resolve(deps.exportsRoot, packagePath);
      const paths = await collectFiles(root, root);
      const files: ExportedPackageFile[] = [];
      for (const path of paths) {
        const relativePath = relative(root, path);
        if (relativePath.startsWith("..")) {
          throw new Error("Export package path escapes the exports directory.");
        }
        files.push({ relativePath, content: await readFile(path, "utf8") });
      }

      return {
        agentId: input.agentId,
        target: input.target,
        files,
        installInstructions:
          "Write these files into ~/.claude/skills/project-intake (user-wide) " +
          "or <project>/.claude/skills/project-intake (project-scoped), " +
          "preserving relative paths. Do not modify the contents.",
      };
    },
  };
}

export type WorkbenchMcpTools = ReturnType<typeof createWorkbenchMcpTools>;
