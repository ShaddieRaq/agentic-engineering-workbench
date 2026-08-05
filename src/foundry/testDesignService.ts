import { randomUUID } from "node:crypto";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import type { ArchitectService } from "./architectService.js";
import type { CapabilityService } from "./capabilityService.js";
import type {
  FoundryArtifactReference,
  FoundryArtifactStore,
} from "./foundryArtifactStore.js";
import type { ProjectBriefService } from "./projectBriefService.js";
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

  constructor(dependencies: {
    agentService: TestDesignAgentRunService;
    capability: Pick<
      CapabilityService,
      "loadCapabilityPlan" | "deriveCapabilityPlanStatus"
    >;
    architect: Pick<ArchitectService, "loadPlan">;
    briefs: Pick<ProjectBriefService, "loadBrief">;
    store: FoundryArtifactStore;
  }) {
    this.#agentService = dependencies.agentService;
    this.#capability = dependencies.capability;
    this.#architect = dependencies.architect;
    this.#briefs = dependencies.briefs;
    this.#store = dependencies.store;
  }

  async createTestSuite(input: {
    capabilityPlanId: string;
    model?: string | undefined;
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

    const response = await this.#agentService.run({
      agentId: TEST_DESIGNER_AGENT_ID,
      input: { brief, plan },
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
    const { artifacts } = await this.#store.list({
      kind: "test-suite-decision",
      briefId: testSuite.briefId,
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

    if (!latest) return "draft";
    if (latest.decision === "approve") return "approved";
    if (latest.decision === "reject") return "rejected";
    return "revision-requested";
  }
}
