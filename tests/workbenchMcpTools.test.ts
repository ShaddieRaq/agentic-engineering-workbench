import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import {
  agentPromotionDecisionSchema,
  type AgentPromotionDecision,
} from "../src/agents/evaluations/agentPromotionDecision.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { projectIntakeBaselinePolicy } from "../src/agents/projectIntake/projectIntakePolicy.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { createProjectIntakeExport } from "../src/foundry/agentExport.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import {
  IntakeSessionController,
  type IntakeAgentRunService,
} from "../src/foundry/intakeSessionController.js";
import type { IntakeTurnOutput } from "../src/foundry/intakeTurnOutput.js";
import { createInitialProjectBrief } from "../src/foundry/projectBrief.js";
import { ProjectBriefService } from "../src/foundry/projectBriefService.js";
import {
  createWorkbenchMcpTools,
  type McpAgentRunner,
  type McpPromotionDecisionService,
} from "../src/mcp/workbenchMcpTools.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

function scriptedIntakeService(
  outputs: Omit<IntakeTurnOutput, "reconciliation">[],
): IntakeAgentRunService {
  let index = 0;
  return {
    async run() {
      const output = outputs[index];
      index += 1;
      if (!output) throw new Error("Scripted intake outputs exhausted.");
      return {
        artifactId: `agent-run-${index}`,
        run: {
          succeeded: true,
          output: { ...output, reconciliation: null },
          failure: null,
        },
      };
    },
  };
}

async function createTools(options: {
  intakeOutputs?: Omit<IntakeTurnOutput, "reconciliation">[];
  agentRunner?: McpAgentRunner;
  promotionDecisions?: McpPromotionDecisionService;
} = {}) {
  const runsDirectory = await mkdtemp(join(tmpdir(), "mcp-runs-"));
  const foundryDirectory = await mkdtemp(join(tmpdir(), "mcp-foundry-"));
  const exportsRoot = await mkdtemp(join(tmpdir(), "mcp-exports-"));
  createdDirectories.push(runsDirectory, foundryDirectory, exportsRoot);

  const foundry = new FoundryArtifactStore(foundryDirectory);
  const briefService = new ProjectBriefService(foundry);
  const intake = new IntakeSessionController({
    agentService: scriptedIntakeService(options.intakeOutputs ?? []),
    briefService,
    store: foundry,
  });
  const tools = createWorkbenchMcpTools({
    agents: platformAgentRegistry,
    artifacts: new FileArtifactStore(runsDirectory),
    foundry,
    exportsRoot,
    agentRunner:
      options.agentRunner ??
      ({
        async run() {
          throw new Error("No agent runner scripted.");
        },
      } satisfies McpAgentRunner),
    promotionDecisions:
      options.promotionDecisions ??
      ({
        async recordPromotionDecision() {
          throw new Error("No promotion decision service scripted.");
        },
      } satisfies McpPromotionDecisionService),
    intake,
    briefs: briefService,
    architect: {
      async createPlan() {
        throw new Error("No architect scripted.");
      },
      async recordPlanDecision() {
        throw new Error("No architect scripted.");
      },
    },
    capability: {
      async createCapabilityPlan() {
        throw new Error("No capability planner scripted.");
      },
      async recordCapabilityDecision() {
        throw new Error("No capability planner scripted.");
      },
    },
    testDesign: {
      async createTestSuite() {
        throw new Error("No test designer scripted.");
      },
      async recordTestSuiteDecision() {
        throw new Error("No test designer scripted.");
      },
    },
    workOrders: {
      async createWorkOrder() {
        throw new Error("No work order service scripted.");
      },
      async nextSlice() {
        throw new Error("No work order service scripted.");
      },
      async materializeVisibleTests() {
        throw new Error("No work order service scripted.");
      },
      async loadWorkOrder() {
        throw new Error("No work order service scripted.");
      },
    },
    suiteReads: {
      async loadTestSuite() {
        throw new Error("No suite reads scripted.");
      },
    },
    submissions: {
      async submitSlice() {
        throw new Error("No submission service scripted.");
      },
      async recordSubmissionDecision() {
        throw new Error("No submission service scripted.");
      },
    },
  });
  return { tools, foundry, exportsRoot };
}

function approvedDecision(): AgentPromotionDecision {
  const policyDigest = digestJsonEvidence(projectIntakeBaselinePolicy);
  const candidateId = randomUUID();
  return agentPromotionDecisionSchema.parse({
    decisionId: randomUUID(),
    decision: "approve",
    candidateEvaluationArtifactId: "candidate-evaluation-1",
    proposalArtifactId: "proposal-1",
    subject: {
      agentId: "project-intake",
      agentVersion: "0.3.0",
      manifestDigest: "a".repeat(64),
    },
    candidate: {
      subjectAgentId: "project-intake",
      baseVersion: "0.3.0",
      candidateId,
      proposalId: "proposal-1",
      baselinePolicyDigest: "b".repeat(64),
      effectivePolicyDigest: policyDigest,
    },
    planId: randomUUID(),
    planDigest: "c".repeat(64),
    gatesPassed: true,
    operatorId: "operator-1",
    rationale: "All gates passed.",
    releaseTask: {
      kind: "source-controlled-agent-release",
      subjectAgentId: "project-intake",
      baseVersion: "0.3.0",
      candidateId,
      proposalId: "proposal-1",
      effectivePolicyDigest: policyDigest,
      requiredActions: ["Apply the approved policy."],
    },
    decidedAt: new Date().toISOString(),
  });
}

function bundleJsonFor(manifest: ReturnType<typeof createProjectIntakeExport>) {
  return JSON.stringify({
    exportIdentity: {
      agentId: manifest.subject.agentId,
      agentVersion: manifest.subject.agentVersion,
      policyDigest: manifest.subject.policyDigest,
      exportId: manifest.exportId,
    },
    sessionDate: "2026-08-04",
    turnCount: 1,
    finalBriefVersion: 1,
    finalBrief: {
      title: "Example",
      ideaSummary: "An example idea.",
      goals: [],
      users: [],
      constraints: [],
      risks: [],
      nonGoals: [],
      assumptions: [],
      acceptanceCriteria: [],
      openQuestions: [],
    },
    issuesObserved: ["A reported issue."],
    observations: [],
  });
}

describe("workbench MCP tools", () => {
  it("lists and describes registered agents", async () => {
    const { tools } = await createTools();
    const agents = await tools.listAgents();

    expect(agents).toHaveLength(10);
    expect(agents).toContainEqual(
      expect.objectContaining({ id: "project-intake", version: "0.3.0" }),
    );

    const manifest = await tools.describeAgent({ agentId: "project-intake" });
    expect(manifest.permissions.toolIds).toEqual([]);

    await expect(tools.describeAgent({ agentId: "ghost" })).rejects.toThrowError();
  });

  it("lists and loads foundry artifacts", async () => {
    const { tools, foundry } = await createTools();
    const brief = createInitialProjectBrief({
      title: "Example",
      ideaSummary: "An example idea.",
    });
    await foundry.saveProjectBrief(brief);

    const listed = await tools.listArtifacts({
      source: "foundry",
      kind: "project-brief",
    });
    expect(listed.artifacts).toHaveLength(1);

    const loaded = await tools.getArtifact({
      source: "foundry",
      artifactId: `${brief.briefId}-v1`,
    });
    expect(loaded.kind).toBe("project-brief");
  });

  it("submits a feedback bundle verified against provenance", async () => {
    const { tools, foundry, exportsRoot } = await createTools();
    const manifest = createProjectIntakeExport({ decision: approvedDecision() });
    const packageDirectory = join(exportsRoot, "claude-code/project-intake");
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      join(packageDirectory, "provenance.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    const result = await tools.submitFeedback({
      bundleJson: bundleJsonFor(manifest),
    });

    expect(result.provenanceVerified).toBe(true);
    expect(result.issuesObserved).toEqual(["A reported issue."]);
    const listed = await foundry.list({ kind: "export-feedback" });
    expect(listed.artifacts).toHaveLength(1);
  });

  it("rejects a feedback bundle whose identity does not match provenance", async () => {
    const { tools, exportsRoot } = await createTools();
    const manifest = createProjectIntakeExport({ decision: approvedDecision() });
    const other = createProjectIntakeExport({ decision: approvedDecision() });
    const packageDirectory = join(exportsRoot, "claude-code/project-intake");
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      join(packageDirectory, "provenance.json"),
      JSON.stringify(other, null, 2),
      "utf8",
    );

    await expect(
      tools.submitFeedback({ bundleJson: bundleJsonFor(manifest) }),
    ).rejects.toThrowError(/does not match provenance export/i);

    await expect(
      tools.submitFeedback({ bundleJson: "not json" }),
    ).rejects.toThrowError();
  });

  it("runs an agent through the injected runner", async () => {
    const { tools } = await createTools({
      agentRunner: {
        async run(request) {
          expect(request.agentId).toBe("repository-assistant");
          return {
            run: {
              succeeded: true,
              output: { overview: "ok" },
              failure: null,
              assessment: { passed: true, message: "Verified." },
            },
            artifactId: "run-artifact-1",
            artifactPath: "/runs/run-artifact-1.json",
          };
        },
      },
    });

    const result = await tools.runAgent({
      agentId: "repository-assistant",
      inputJson: '{"instruction":"inspect"}',
    });
    expect(result.succeeded).toBe(true);
    expect(result.artifactId).toBe("run-artifact-1");

    await expect(
      tools.runAgent({ agentId: "repository-assistant", inputJson: "not json" }),
    ).rejects.toThrowError();
  });

  it("drives an intake interview and records the brief decision", async () => {
    const goal = {
      id: randomUUID(),
      text: "Confirmed goal",
      source: "user-stated" as const,
    };
    const question = {
      id: randomUUID(),
      question: "Who are the users?",
      targetEntryIds: [] as string[],
      intent: "elicit-new" as const,
    };
    const content = {
      title: "Example",
      ideaSummary: "An example idea.",
      goals: [goal],
      users: [],
      constraints: [],
      risks: [],
      nonGoals: [],
      assumptions: [],
      acceptanceCriteria: [],
      openQuestions: [],
    };
    const { tools } = await createTools({
      intakeOutputs: [
        {
          updatedBriefDraft: content,
          nextQuestions: [question],
          openIssues: [
            {
              id: randomUUID(),
              description: "Users unknown.",
              severity: "blocking",
              relatedEntryIds: [],
            },
          ],
        },
        { updatedBriefDraft: content, nextQuestions: [], openIssues: [] },
      ],
    });

    const started = await tools.intakeStart({
      title: "Example",
      idea: "An example idea.",
      maxTurns: 5,
    });
    expect(started.status).toBe("awaiting-answers");
    expect(started.nextQuestions).toHaveLength(1);

    const second = await tools.intakeTurn({
      briefId: started.briefId,
      answers: [{ questionId: question.id, answer: "Internal QA engineers." }],
    });
    expect(second.status).toBe("ready-for-decision");
    expect(second.briefVersion).toBe(3);

    const status = await tools.intakeStatus({ briefId: started.briefId });
    expect(status.status).toBe("ready-for-decision");

    const decided = await tools.recordBriefDecision({
      briefId: started.briefId,
      version: second.briefVersion,
      decision: "approve",
      operatorId: "rashad",
      rationale: "Complete and confirmed.",
    });
    expect(decided.decision.decision).toBe("approve");
  });

  it("blocks brief approval with open questions through the tool", async () => {
    const goal = {
      id: randomUUID(),
      text: "A goal",
      source: "user-stated" as const,
    };
    const { tools } = await createTools({
      intakeOutputs: [
        {
          updatedBriefDraft: {
            title: "Example",
            ideaSummary: "An example idea.",
            goals: [goal],
            users: [],
            constraints: [],
            risks: [],
            nonGoals: [],
            assumptions: [],
            acceptanceCriteria: [],
            openQuestions: [
              {
                id: randomUUID(),
                question: "Undecided detail?",
                relatedEntryIds: [goal.id],
              },
            ],
          },
          nextQuestions: [],
          openIssues: [],
        },
      ],
    });

    const started = await tools.intakeStart({
      title: "Example",
      idea: "An example idea.",
    });

    await expect(
      tools.recordBriefDecision({
        briefId: started.briefId,
        version: started.briefVersion,
        decision: "approve",
        operatorId: "rashad",
        rationale: "Ship it.",
      }),
    ).rejects.toThrowError(/open questions cannot be approved/i);
  });

  it("passes promotion decisions through with operator identity", async () => {
    const { tools } = await createTools({
      promotionDecisions: {
        async recordPromotionDecision(request) {
          expect(request.operatorId).toBe("rashad");
          expect(request.decision).toBe("revise");
          return { decision: { decisionId: "d1" }, artifactId: "artifact-1" };
        },
      },
    });

    const result = await tools.recordPromotionDecision({
      candidateEvaluationId: "comparison-1",
      decision: "revise",
      operatorId: "rashad",
      rationale: "Needs another iteration.",
    });
    expect(result.artifactId).toBe("artifact-1");
  });

  it("serves the approved export package files", async () => {
    const { tools, exportsRoot } = await createTools();
    const packageDirectory = join(exportsRoot, "claude-code/project-intake");
    await mkdir(join(packageDirectory, "references"), { recursive: true });
    await writeFile(join(packageDirectory, "SKILL.md"), "skill content", "utf8");
    await writeFile(
      join(packageDirectory, "references", "feedback-bundle.md"),
      "bundle contract",
      "utf8",
    );

    const result = await tools.getApprovedExport({
      agentId: "project-intake",
      target: "claude-code",
    });
    expect(result.files.map(({ relativePath }) => relativePath)).toEqual([
      "SKILL.md",
      "references/feedback-bundle.md",
    ]);
    expect(result.files[0]?.content).toBe("skill content");

    await expect(
      tools.getApprovedExport({ agentId: "ghost", target: "claude-code" }),
    ).rejects.toThrowError(/no approved claude-code export/i);
  });
});
