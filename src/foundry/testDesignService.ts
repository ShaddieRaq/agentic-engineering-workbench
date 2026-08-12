import { randomUUID } from "node:crypto";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import type { ArchitectService } from "./architectService.js";
import type { CapabilityService } from "./capabilityService.js";
import type {
  FoundryArtifactReference,
  FoundryArtifactStore,
} from "./foundryArtifactStore.js";
import type { ProjectBriefService } from "./projectBriefService.js";
import type { SuiteVacuityCheck } from "./suiteVacuityCheck.js";
import {
  testSuiteOutputSchema,
  testSuiteSchema,
  type TestSuite,
} from "./testSuite.js";
import {
  createTestSuiteDecision,
  type TestSuiteDecision,
  type TestSuiteDecisionKind,
} from "./testSuiteDecision.js";
import {
  diffAcceptanceCriteria,
  validateSuiteSuccession,
  type CriteriaDiff,
  type SuiteSuccession,
} from "./testSuiteSuccession.js";

export const TEST_DESIGNER_AGENT_ID = "test-designer";

export interface TestDesignAgentRunService {
  run(request: { agentId: string; input: unknown; model?: string }): Promise<{
    artifactId: string;
    run: {
      succeeded: boolean;
      output: unknown;
      failure: { message: string } | null;
    };
  }>;
}

export interface SavedTestSuite {
  testSuite: TestSuite;
  reference: FoundryArtifactReference;
}

export interface SavedTestSuiteDecision {
  decision: TestSuiteDecision;
  reference: FoundryArtifactReference;
}

export class TestDesignService {
  readonly #agentService: TestDesignAgentRunService;
  readonly #capability: Pick<
    CapabilityService,
    "loadCapabilityPlan" | "deriveCapabilityPlanStatus"
  >;
  readonly #architect: Pick<ArchitectService, "loadPlan">;
  readonly #briefs: Pick<ProjectBriefService, "loadBrief">;
  readonly #store: FoundryArtifactStore;
  readonly #vacuityCheck: SuiteVacuityCheck | null;

  constructor(dependencies: {
    agentService: TestDesignAgentRunService;
    capability: Pick<
      CapabilityService,
      "loadCapabilityPlan" | "deriveCapabilityPlanStatus"
    >;
    architect: Pick<ArchitectService, "loadPlan">;
    briefs: Pick<ProjectBriefService, "loadBrief">;
    store: FoundryArtifactStore;
    // Null-implementation gate (optional so evidence-only embeds and
    // existing tests keep working; every runtime wires it): returns the
    // paths of test files that PASS against an empty project.
    vacuityCheck?: SuiteVacuityCheck;
  }) {
    this.#agentService = dependencies.agentService;
    this.#capability = dependencies.capability;
    this.#architect = dependencies.architect;
    this.#briefs = dependencies.briefs;
    this.#store = dependencies.store;
    this.#vacuityCheck = dependencies.vacuityCheck ?? null;
  }

  async createTestSuite(input: {
    capabilityPlanId: string;
    model?: string | undefined;
    reviseFromId?: string | undefined;
  }): Promise<SavedTestSuite> {
    const status = await this.#capability.deriveCapabilityPlanStatus(
      input.capabilityPlanId,
    );
    if (status !== "approved") {
      throw new Error(
        `Capability plan ${input.capabilityPlanId} is ${status}; only an approved capability plan can receive acceptance tests.`,
      );
    }
    const capabilityPlan = await this.#capability.loadCapabilityPlan(
      input.capabilityPlanId,
    );
    const plan = await this.#architect.loadPlan(capabilityPlan.planId);
    if (digestJsonEvidence(plan) !== capabilityPlan.planDigest) {
      throw new Error(
        "Chain integrity failure: the architecture plan no longer matches the digest pinned by the capability plan.",
      );
    }
    const brief = await this.#briefs.loadBrief(
      capabilityPlan.briefId,
      capabilityPlan.briefVersion,
    );

    // Evolution round (Decision 088): the plan's completion lineage makes
    // this suite a SUCCESSOR — the prior suite (holdouts included) feeds
    // the designer, and the output must satisfy the succession rules.
    let evolution: {
      priorSuite: TestSuite;
      diff: CriteriaDiff;
      requiredHoldoutCount: number;
    } | null = null;
    if (plan.evolvesFromCompletionId) {
      const stored = await this.#store.load(plan.evolvesFromCompletionId);
      if (stored.kind !== "build-completion") {
        throw new Error(
          `Artifact ${plan.evolvesFromCompletionId} is not a build completion.`,
        );
      }
      const completion = stored.artifact;
      const priorSuite = await this.loadTestSuite(completion.testSuiteId);
      if (digestJsonEvidence(priorSuite) !== completion.testSuiteDigest) {
        throw new Error(
          "Chain integrity failure: the prior suite no longer matches the digest pinned by the completion record.",
        );
      }
      const priorBrief = await this.#briefs.loadBrief(
        completion.briefId,
        completion.briefVersion,
      );
      const diff = diffAcceptanceCriteria(priorBrief, brief);
      const priorHoldouts = priorSuite.content.testFiles.filter(
        ({ visibility }) => visibility === "holdout",
      ).length;
      evolution = {
        priorSuite,
        diff,
        requiredHoldoutCount: priorHoldouts + 1,
      };
    }

    let revision: { previous: unknown; requestedRevisions: string[] } | null =
      null;
    let revisionDecisionId: string | null = null;
    if (input.reviseFromId) {
      const prior = await this.loadTestSuite(input.reviseFromId);
      if (prior.capabilityPlanId !== input.capabilityPlanId) {
        throw new Error(
          `Test suite ${input.reviseFromId} belongs to a different capability plan and cannot seed this revision.`,
        );
      }
      const decision = await this.#latestDecisionFor(
        prior.testSuiteId,
        prior.briefId,
      );
      if (!decision || decision.decision !== "revise") {
        throw new Error(
          `Test suite ${input.reviseFromId} has no revise decision to consume.`,
        );
      }
      revision = {
        previous: prior.content,
        requestedRevisions: decision.requestedRevisions ?? [],
      };
      revisionDecisionId = decision.decisionId;
    }

    const response = await this.#agentService.run({
      agentId: TEST_DESIGNER_AGENT_ID,
      input: {
        brief,
        plan,
        ...(revision ? { revision } : {}),
        ...(evolution
          ? {
              evolution: {
                priorSuiteContent: evolution.priorSuite.content,
                requiredHoldoutCount: evolution.requiredHoldoutCount,
                unchangedCriterionIds: [...evolution.diff.unchangedIds].sort(),
                changedCriterionIds: [...evolution.diff.changedIds].sort(),
                newCriterionIds: [...evolution.diff.newIds].sort(),
                retiredCriterionIds: [...evolution.diff.retiredIds].sort(),
              },
            }
          : {}),
      },
      ...(input.model ? { model: input.model } : {}),
    });
    if (!response.run.succeeded || response.run.output === null) {
      throw new Error(
        response.run.failure?.message ??
          "Test designer run did not produce a valid test suite.",
      );
    }
    const output = testSuiteOutputSchema.parse(response.run.output);
    const { reconciliation, ...content } = output;

    let succession: SuiteSuccession | null = null;
    if (evolution) {
      succession = validateSuiteSuccession({
        priorSuiteContent: evolution.priorSuite.content,
        content,
        diff: evolution.diff,
      });
    }

    // Null-implementation gate: every file must FAIL against a project
    // that contains nothing. A file that passes there cannot tell the
    // product's absence from its presence and verifies nothing.
    let vacuityCheck: { checkedFileCount: number } | null = null;
    if (this.#vacuityCheck) {
      const vacuousFiles = await this.#vacuityCheck(
        content.testFiles.map(({ path, content: fileContent }) => ({
          path,
          content: fileContent,
        })),
      );
      if (vacuousFiles.length > 0) {
        throw new Error(
          `Test suite rejected by the null-implementation gate: file(s) ${vacuousFiles.join(
            ", ",
          )} PASS against an empty project with no implementation, so they verify nothing. Every test file must execute the real product and fail until it exists.`,
        );
      }
      // Passing evidence: every file demanded a real implementation. Persist
      // it so the gate is visible when it works, not only when it fires.
      vacuityCheck = { checkedFileCount: content.testFiles.length };
    }

    const testSuite = testSuiteSchema.parse({
      testSuiteId: randomUUID(),
      capabilityPlanId: capabilityPlan.capabilityPlanId,
      capabilityPlanDigest: digestJsonEvidence(capabilityPlan),
      planId: plan.planId,
      briefId: capabilityPlan.briefId,
      briefVersion: capabilityPlan.briefVersion,
      agentRunArtifactId: response.artifactId,
      content,
      reconciliation,
      createdAt: new Date().toISOString(),
      ...(vacuityCheck ? { vacuityCheck } : {}),
      ...(input.reviseFromId
        ? { revisedFromArtifactId: input.reviseFromId }
        : {}),
      ...(revisionDecisionId ? { revisionDecisionId } : {}),
      ...(evolution
        ? { evolvesFromTestSuiteId: evolution.priorSuite.testSuiteId }
        : {}),
      ...(succession
        ? {
            fileLineage: succession.fileLineage,
            retiredFilePaths: succession.retiredFilePaths,
          }
        : {}),
    });
    const reference = await this.#store.saveTestSuite(testSuite);
    return { testSuite, reference };
  }

  async loadTestSuite(testSuiteId: string): Promise<TestSuite> {
    const stored = await this.#store.load(testSuiteId);
    if (stored.kind !== "test-suite") {
      throw new Error(`Artifact ${testSuiteId} is not a test suite.`);
    }
    return stored.artifact;
  }

  async recordTestSuiteDecision(input: {
    testSuiteId: string;
    decision: TestSuiteDecisionKind;
    operatorId: string;
    rationale: string;
    requestedRevisions?: string[] | null;
  }): Promise<SavedTestSuiteDecision> {
    const testSuite = await this.loadTestSuite(input.testSuiteId);
    const decision = createTestSuiteDecision({
      testSuite,
      testSuiteArtifactId: testSuite.testSuiteId,
      decision: input.decision,
      operatorId: input.operatorId,
      rationale: input.rationale,
      requestedRevisions: input.requestedRevisions ?? null,
    });
    const reference = await this.#store.saveTestSuiteDecision(decision);
    return { decision, reference };
  }

  async deriveTestSuiteStatus(
    testSuiteId: string,
  ): Promise<"draft" | "approved" | "rejected" | "revision-requested"> {
    const testSuite = await this.loadTestSuite(testSuiteId);
    const latest = await this.#latestDecisionFor(testSuiteId, testSuite.briefId);

    if (!latest) return "draft";
    if (latest.decision === "approve") return "approved";
    if (latest.decision === "reject") return "rejected";
    return "revision-requested";
  }

  async #latestDecisionFor(
    testSuiteId: string,
    briefId: string,
  ): Promise<TestSuiteDecision | null> {
    const { artifacts } = await this.#store.list({
      kind: "test-suite-decision",
      briefId,
      limit: 500,
    });

    let latest: TestSuiteDecision | null = null;
    for (const summary of artifacts) {
      const stored = await this.#store.load(summary.id);
      if (stored.kind !== "test-suite-decision") continue;
      if (stored.artifact.testSuiteId !== testSuiteId) continue;
      if (
        latest === null ||
        stored.artifact.decidedAt.localeCompare(latest.decidedAt) > 0
      ) {
        latest = stored.artifact;
      }
    }
    return latest;
  }
}
