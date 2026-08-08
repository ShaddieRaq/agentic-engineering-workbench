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
import type { BuildCompletion } from "./buildCompletion.js";
import { diffAcceptanceCriteria } from "./testSuiteSuccession.js";
import {
  projectBriefArtifactId,
  type FoundryArtifactReference,
  type FoundryArtifactStore,
} from "./foundryArtifactStore.js";
import type { ProjectBriefService } from "./projectBriefService.js";

export const PROJECT_ARCHITECT_AGENT_ID = "project-architect";

// Deterministic slice-disposition computation (Decision 088): the model
// never authors the carried flag. Fails loudly when the output rewrites
// history — a built slice missing or altered.
export function computeSliceDispositions(input: {
  content: ArchitecturePlan["content"];
  priorPlan: ArchitecturePlan;
  builtSliceIds: string[];
}): { sliceId: string; disposition: "carried" | "delta" }[] {
  const priorSlices = new Map(
    input.priorPlan.content.implementationSlices.map((slice) => [
      slice.id,
      slice,
    ]),
  );
  const outputSlices = new Map(
    input.content.implementationSlices.map((slice) => [slice.id, slice]),
  );

  const missing = input.builtSliceIds.filter((id) => !outputSlices.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Evolution plan rejected: built slice(s) ${missing.join(", ")} are ` +
        "missing from the plan. Built slices are history and must be " +
        "reproduced exactly.",
    );
  }
  const altered = input.builtSliceIds.filter((id) => {
    const prior = priorSlices.get(id);
    const emitted = outputSlices.get(id);
    return (
      prior === undefined ||
      JSON.stringify(emitted) !== JSON.stringify(prior)
    );
  });
  if (altered.length > 0) {
    throw new Error(
      `Evolution plan rejected: built slice(s) ${altered.join(", ")} differ ` +
        "from the prior approved plan. Changed behavior must be a NEW slice " +
        "depending on the built one, never an edit to it.",
    );
  }

  const built = new Set(input.builtSliceIds);
  return input.content.implementationSlices.map((slice) => ({
    sliceId: slice.id,
    disposition: built.has(slice.id) ? ("carried" as const) : ("delta" as const),
  }));
}

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
    // Decision 088: the completion record this evolution round descends
    // from. Built slices are carried byte-identical; the Workbench, not
    // the model, computes each slice's disposition.
    evolvesFromCompletionId?: string | undefined;
  }): Promise<SavedArchitecturePlan> {
    const status = await this.#briefService.deriveBriefStatus(input.briefId);
    if (status !== "approved") {
      throw new Error(
        `Brief ${input.briefId} is ${status}; only an approved brief can be planned.`,
      );
    }
    const brief = await this.#briefService.loadBrief(input.briefId);

    let evolution: {
      completion: BuildCompletion;
      priorPlan: ArchitecturePlan;
    } | null = null;
    let evolutionCriteriaDiff: ReturnType<typeof diffAcceptanceCriteria> | null =
      null;
    if (input.evolvesFromCompletionId) {
      const stored = await this.#store.load(input.evolvesFromCompletionId);
      if (stored.kind !== "build-completion") {
        throw new Error(
          `Artifact ${input.evolvesFromCompletionId} is not a build completion.`,
        );
      }
      const completion = stored.artifact;
      if (completion.briefId !== input.briefId) {
        throw new Error(
          `Completion ${completion.completionId} belongs to a different brief.`,
        );
      }
      if (brief.version <= completion.briefVersion) {
        throw new Error(
          `Evolution requires a brief version newer than the completion's ` +
            `(brief v${brief.version} vs completion at v${completion.briefVersion}); ` +
            "reopen the brief and record the new requirements first.",
        );
      }
      const priorPlan = await this.loadPlan(completion.planId);
      if (digestJsonEvidence(priorPlan) !== completion.planDigest) {
        throw new Error(
          "Chain integrity failure: the prior plan no longer matches the digest pinned by the completion record.",
        );
      }
      evolution = { completion, priorPlan };
      const priorBrief = await this.#briefService.loadBrief(
        input.briefId,
        completion.briefVersion,
      );
      evolutionCriteriaDiff = diffAcceptanceCriteria(priorBrief, brief);
    }

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
      input: {
        brief,
        ...(revision ? { revision } : {}),
        ...(evolution
          ? {
              evolution: {
                builtSliceIds: evolution.completion.builtSliceIds,
                priorPlanContent: evolution.priorPlan.content,
                changedOrNewCriterionIds: [
                  ...evolutionCriteriaDiff!.changedIds,
                  ...evolutionCriteriaDiff!.newIds,
                ].sort(),
              },
            }
          : {}),
      },
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

    let sliceDispositions:
      | { sliceId: string; disposition: "carried" | "delta" }[]
      | null = null;
    if (evolution) {
      sliceDispositions = computeSliceDispositions({
        content,
        priorPlan: evolution.priorPlan,
        builtSliceIds: evolution.completion.builtSliceIds,
      });
      // Generation-3 lesson (Mac Librarian): a changed or new criterion
      // mapped only to carried slices is implemented by NO ONE — carried
      // slices are history and never rebuilt, so the requirement ships
      // green-on-paper and unmet in reality. Changed meaning must be
      // owned by delta work.
      const diff = evolutionCriteriaDiff!;
      const mustBeDeltaOwned = [...diff.changedIds, ...diff.newIds];
      const deltaSliceIds = new Set(
        sliceDispositions
          .filter(({ disposition }) => disposition === "delta")
          .map(({ sliceId }) => sliceId),
      );
      const deltaOwnedCriteria = new Set(
        content.implementationSlices
          .filter(({ id }) => deltaSliceIds.has(id))
          .flatMap(({ verifiedByCriterionIds }) => verifiedByCriterionIds),
      );
      const orphaned = mustBeDeltaOwned.filter(
        (criterionId) => !deltaOwnedCriteria.has(criterionId),
      );
      if (orphaned.length > 0) {
        throw new Error(
          `Evolution plan rejected: changed or new criterion(s) ${orphaned.join(", ")} ` +
            "are not verified by any DELTA slice. Carried slices are never " +
            "rebuilt, so changed meaning must be owned by a delta slice — " +
            "add or extend delta slices to cover these criteria.",
        );
      }
    }

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
      ...(evolution
        ? { evolvesFromCompletionId: evolution.completion.completionId }
        : {}),
      ...(sliceDispositions ? { sliceDispositions } : {}),
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
