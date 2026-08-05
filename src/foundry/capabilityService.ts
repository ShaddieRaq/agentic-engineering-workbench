import { randomUUID } from "node:crypto";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import type { ArchitectService } from "./architectService.js";
import {
  capabilityPlanOutputSchema,
  capabilityPlanSchema,
  type CapabilityCatalog,
  type CapabilityPlan,
} from "./capabilityPlan.js";
import {
  createCapabilityPlanDecision,
  type CapabilityPlanDecision,
  type CapabilityPlanDecisionKind,
} from "./capabilityPlanDecision.js";
import type {
  FoundryArtifactReference,
  FoundryArtifactStore,
} from "./foundryArtifactStore.js";

export const CAPABILITY_PLANNER_AGENT_ID = "capability-planner";

export interface CapabilityAgentRunService {
  run(request: { agentId: string; input: unknown; model?: string }): Promise<{
    artifactId: string;
    run: {
      succeeded: boolean;
      output: unknown;
      failure: { message: string } | null;
    };
  }>;
}

export interface SavedCapabilityPlan {
  capabilityPlan: CapabilityPlan;
  reference: FoundryArtifactReference;
}

export interface SavedCapabilityPlanDecision {
  decision: CapabilityPlanDecision;
  reference: FoundryArtifactReference;
}

export class CapabilityService {
  readonly #agentService: CapabilityAgentRunService;
  readonly #architect: Pick<ArchitectService, "loadPlan" | "derivePlanStatus">;
  readonly #store: FoundryArtifactStore;
  readonly #catalogFactory: () => CapabilityCatalog;

  constructor(dependencies: {
    agentService: CapabilityAgentRunService;
    architect: Pick<ArchitectService, "loadPlan" | "derivePlanStatus">;
    store: FoundryArtifactStore;
    catalogFactory: () => CapabilityCatalog;
  }) {
    this.#agentService = dependencies.agentService;
    this.#architect = dependencies.architect;
    this.#store = dependencies.store;
    this.#catalogFactory = dependencies.catalogFactory;
  }

  async createCapabilityPlan(input: {
    planId: string;
    model?: string | undefined;
    reviseFromId?: string | undefined;
  }): Promise<SavedCapabilityPlan> {
    const status = await this.#architect.derivePlanStatus(input.planId);
    if (status !== "approved") {
      throw new Error(
        `Architecture plan ${input.planId} is ${status}; only an approved plan can be capability-mapped.`,
      );
    }
    const plan = await this.#architect.loadPlan(input.planId);
    const catalog = this.#catalogFactory();

    let revision: { previous: unknown; requestedRevisions: string[] } | null =
      null;
    let revisionDecisionId: string | null = null;
    if (input.reviseFromId) {
      const prior = await this.loadCapabilityPlan(input.reviseFromId);
      if (prior.planId !== input.planId) {
        throw new Error(
          `Capability plan ${input.reviseFromId} belongs to a different architecture plan and cannot seed this revision.`,
        );
      }
      const decision = await this.#latestDecisionFor(
        prior.capabilityPlanId,
        prior.briefId,
      );
      if (!decision || decision.decision !== "revise") {
        throw new Error(
          `Capability plan ${input.reviseFromId} has no revise decision to consume.`,
        );
      }
      revision = {
        previous: prior.content,
        requestedRevisions: decision.requestedRevisions ?? [],
      };
      revisionDecisionId = decision.decisionId;
    }

    const response = await this.#agentService.run({
      agentId: CAPABILITY_PLANNER_AGENT_ID,
      input: { plan, catalog, ...(revision ? { revision } : {}) },
      ...(input.model ? { model: input.model } : {}),
    });
    if (!response.run.succeeded || response.run.output === null) {
      throw new Error(
        response.run.failure?.message ??
          "Capability planner run did not produce a valid plan.",
      );
    }
    const output = capabilityPlanOutputSchema.parse(response.run.output);
    const { reconciliation, ...content } = output;

    const capabilityPlan = capabilityPlanSchema.parse({
      capabilityPlanId: randomUUID(),
      planId: plan.planId,
      planArtifactId: plan.planId,
      planDigest: digestJsonEvidence(plan),
      briefId: plan.briefId,
      briefVersion: plan.briefVersion,
      agentRunArtifactId: response.artifactId,
      catalog,
      content,
      reconciliation,
      createdAt: new Date().toISOString(),
      ...(input.reviseFromId
        ? { revisedFromArtifactId: input.reviseFromId }
        : {}),
      ...(revisionDecisionId ? { revisionDecisionId } : {}),
    });
    const reference = await this.#store.saveCapabilityPlan(capabilityPlan);
    return { capabilityPlan, reference };
  }

  async loadCapabilityPlan(capabilityPlanId: string): Promise<CapabilityPlan> {
    const stored = await this.#store.load(capabilityPlanId);
    if (stored.kind !== "capability-plan") {
      throw new Error(`Artifact ${capabilityPlanId} is not a capability plan.`);
    }
    return stored.artifact;
  }

  async recordCapabilityDecision(input: {
    capabilityPlanId: string;
    decision: CapabilityPlanDecisionKind;
    operatorId: string;
    rationale: string;
    requestedRevisions?: string[] | null;
  }): Promise<SavedCapabilityPlanDecision> {
    const capabilityPlan = await this.loadCapabilityPlan(input.capabilityPlanId);
    const decision = createCapabilityPlanDecision({
      capabilityPlan,
      capabilityPlanArtifactId: capabilityPlan.capabilityPlanId,
      decision: input.decision,
      operatorId: input.operatorId,
      rationale: input.rationale,
      requestedRevisions: input.requestedRevisions ?? null,
    });
    const reference = await this.#store.saveCapabilityPlanDecision(decision);
    return { decision, reference };
  }

  async deriveCapabilityPlanStatus(
    capabilityPlanId: string,
  ): Promise<"draft" | "approved" | "rejected" | "revision-requested"> {
    const capabilityPlan = await this.loadCapabilityPlan(capabilityPlanId);
    const latest = await this.#latestDecisionFor(
      capabilityPlanId,
      capabilityPlan.briefId,
    );

    if (!latest) return "draft";
    if (latest.decision === "approve") return "approved";
    if (latest.decision === "reject") return "rejected";
    return "revision-requested";
  }

  async #latestDecisionFor(
    capabilityPlanId: string,
    briefId: string,
  ): Promise<CapabilityPlanDecision | null> {
    const { artifacts } = await this.#store.list({
      kind: "capability-plan-decision",
      briefId,
      limit: 500,
    });

    let latest: CapabilityPlanDecision | null = null;
    for (const summary of artifacts) {
      const stored = await this.#store.load(summary.id);
      if (stored.kind !== "capability-plan-decision") continue;
      if (stored.artifact.capabilityPlanId !== capabilityPlanId) continue;
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
