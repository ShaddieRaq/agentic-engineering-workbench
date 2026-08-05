import { randomUUID } from "node:crypto";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import {
  architecturePlanSchema,
  architectPlanOutputSchema,
  type ArchitecturePlan,
} from "./architecturePlan.js";
import {
  createArchitecturePlanDecision,
  type ArchitecturePlanDecision,
  type ArchitecturePlanDecisionKind,
} from "./architecturePlanDecision.js";
import {
  projectBriefArtifactId,
  type FoundryArtifactReference,
  type FoundryArtifactStore,
} from "./foundryArtifactStore.js";
import type { ProjectBriefService } from "./projectBriefService.js";

export const PROJECT_ARCHITECT_AGENT_ID = "project-architect";

export interface ArchitectAgentRunService {
  run(request: { agentId: string; input: unknown; model?: string }): Promise<{
    artifactId: string;
    run: {
      succeeded: boolean;
      output: unknown;
      failure: { message: string } | null;
    };
  }>;
}

export interface SavedArchitecturePlan {
  plan: ArchitecturePlan;
  reference: FoundryArtifactReference;
}

export interface SavedArchitecturePlanDecision {
  decision: ArchitecturePlanDecision;
  reference: FoundryArtifactReference;
}

export class ArchitectService {
  readonly #agentService: ArchitectAgentRunService;
  readonly #briefService: ProjectBriefService;
  readonly #store: FoundryArtifactStore;

  constructor(dependencies: {
    agentService: ArchitectAgentRunService;
    briefService: ProjectBriefService;
    store: FoundryArtifactStore;
  }) {
    this.#agentService = dependencies.agentService;
    this.#briefService = dependencies.briefService;
    this.#store = dependencies.store;
  }

  async createPlan(input: {
    briefId: string;
    model?: string | undefined;
    reviseFromId?: string | undefined;
  }): Promise<SavedArchitecturePlan> {
    const status = await this.#briefService.deriveBriefStatus(input.briefId);
    if (status !== "approved") {
      throw new Error(
        `Brief ${input.briefId} is ${status}; only an approved brief can be planned.`,
      );
    }
    const brief = await this.#briefService.loadBrief(input.briefId);

    let revision: { previous: unknown; requestedRevisions: string[] } | null =
      null;
    let revisionDecisionId: string | null = null;
    if (input.reviseFromId) {
      const prior = await this.loadPlan(input.reviseFromId);
      if (prior.briefId !== input.briefId) {
        throw new Error(
          `Plan ${input.reviseFromId} belongs to a different brief and cannot seed this revision.`,
        );
      }
      const decision = await this.#latestDecisionFor(prior.planId, prior.briefId);
      if (!decision || decision.decision !== "revise") {
        throw new Error(
          `Plan ${input.reviseFromId} has no revise decision to consume.`,
        );
      }
      revision = {
        previous: prior.content,
        requestedRevisions: decision.requestedRevisions ?? [],
      };
      revisionDecisionId = decision.decisionId;
    }

    const response = await this.#agentService.run({
      agentId: PROJECT_ARCHITECT_AGENT_ID,
      input: { brief, ...(revision ? { revision } : {}) },
      ...(input.model ? { model: input.model } : {}),
    });
    if (!response.run.succeeded || response.run.output === null) {
      throw new Error(
        response.run.failure?.message ??
          "Project architect run did not produce a valid plan.",
      );
    }
    const output = architectPlanOutputSchema.parse(response.run.output);
    const { reconciliation, ...content } = output;

    const plan = architecturePlanSchema.parse({
      planId: randomUUID(),
      briefId: brief.briefId,
      briefVersion: brief.version,
      briefArtifactId: projectBriefArtifactId(brief),
      briefDigest: digestJsonEvidence(brief),
      agentRunArtifactId: response.artifactId,
      content,
      reconciliation,
      createdAt: new Date().toISOString(),
      ...(input.reviseFromId
        ? { revisedFromArtifactId: input.reviseFromId }
        : {}),
      ...(revisionDecisionId ? { revisionDecisionId } : {}),
    });
    const reference = await this.#store.saveArchitecturePlan(plan);
    return { plan, reference };
  }

  async loadPlan(planId: string): Promise<ArchitecturePlan> {
    const stored = await this.#store.load(planId);
    if (stored.kind !== "architecture-plan") {
      throw new Error(`Artifact ${planId} is not an architecture plan.`);
    }
    return stored.artifact;
  }

  async recordPlanDecision(input: {
    planId: string;
    decision: ArchitecturePlanDecisionKind;
    operatorId: string;
    rationale: string;
    requestedRevisions?: string[] | null;
  }): Promise<SavedArchitecturePlanDecision> {
    const plan = await this.loadPlan(input.planId);
    const decision = createArchitecturePlanDecision({
      plan,
      planArtifactId: plan.planId,
      decision: input.decision,
      operatorId: input.operatorId,
      rationale: input.rationale,
      requestedRevisions: input.requestedRevisions ?? null,
    });
    const reference = await this.#store.saveArchitecturePlanDecision(decision);
    return { decision, reference };
  }

  async derivePlanStatus(
    planId: string,
  ): Promise<"draft" | "approved" | "rejected" | "revision-requested"> {
    const plan = await this.loadPlan(planId);
    const latest = await this.#latestDecisionFor(planId, plan.briefId);

    if (!latest) return "draft";
    if (latest.decision === "approve") return "approved";
    if (latest.decision === "reject") return "rejected";
    return "revision-requested";
  }

  async #latestDecisionFor(
    planId: string,
    briefId: string,
  ): Promise<ArchitecturePlanDecision | null> {
    const { artifacts } = await this.#store.list({
      kind: "architecture-plan-decision",
      briefId,
      limit: 500,
    });

    let latest: ArchitecturePlanDecision | null = null;
    for (const summary of artifacts) {
      const stored = await this.#store.load(summary.id);
      if (stored.kind !== "architecture-plan-decision") continue;
      if (stored.artifact.planId !== planId) continue;
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
