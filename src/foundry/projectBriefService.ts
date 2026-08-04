import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import {
  FoundryArtifactStore,
  projectBriefArtifactId,
  type FoundryArtifactReference,
  type FoundryArtifactSummary,
} from "./foundryArtifactStore.js";
import {
  createInitialProjectBrief,
  createNextBriefVersion,
  type ProjectBrief,
} from "./projectBrief.js";
import {
  createProjectBriefDecision,
  type ProjectBriefDecision,
  type ProjectBriefDecisionKind,
} from "./projectBriefDecision.js";

export type ProjectBriefStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "revision-requested";

export interface BriefLineageReport {
  briefId: string;
  latestVersion: number;
  valid: boolean;
  failures: { version: number; reason: string }[];
}

export interface SavedProjectBrief {
  brief: ProjectBrief;
  reference: FoundryArtifactReference;
}

export interface SavedProjectBriefDecision {
  decision: ProjectBriefDecision;
  reference: FoundryArtifactReference;
}

export class ProjectBriefService {
  readonly #store: FoundryArtifactStore;

  constructor(store: FoundryArtifactStore = new FoundryArtifactStore()) {
    this.#store = store;
  }

  async initiateBrief(
    input: Parameters<typeof createInitialProjectBrief>[0],
  ): Promise<SavedProjectBrief> {
    const brief = createInitialProjectBrief(input);
    const reference = await this.#store.saveProjectBrief(brief);
    return { brief, reference };
  }

  async appendBriefVersion(
    briefId: string,
    updated: Parameters<typeof createNextBriefVersion>[0]["updated"],
  ): Promise<SavedProjectBrief> {
    const previous = await this.loadBrief(briefId);
    const brief = createNextBriefVersion({
      previous,
      previousArtifactId: projectBriefArtifactId(previous),
      updated,
    });
    const reference = await this.#store.saveProjectBrief(brief);
    return { brief, reference };
  }

  async loadBrief(briefId: string, version?: number): Promise<ProjectBrief> {
    const resolvedVersion = version ?? (await this.#latestVersion(briefId));
    const stored = await this.#store.load(`${briefId}-v${resolvedVersion}`);
    if (stored.kind !== "project-brief") {
      throw new Error(`Artifact ${briefId}-v${resolvedVersion} is not a project brief.`);
    }
    return stored.artifact;
  }

  async listBriefVersions(briefId: string): Promise<FoundryArtifactSummary[]> {
    const { artifacts } = await this.#store.list({
      kind: "project-brief",
      briefId,
      limit: 500,
    });
    return [...artifacts].sort((left, right) => left.briefVersion - right.briefVersion);
  }

  async verifyLineage(briefId: string): Promise<BriefLineageReport> {
    const versions = await this.listBriefVersions(briefId);
    if (versions.length === 0) {
      throw new Error(`Unknown brief: ${briefId}`);
    }

    const failures: BriefLineageReport["failures"] = [];
    const briefsByVersion = new Map<number, ProjectBrief>();
    for (const summary of versions) {
      briefsByVersion.set(
        summary.briefVersion,
        await this.loadBrief(briefId, summary.briefVersion),
      );
    }

    const latestVersion = Math.max(...briefsByVersion.keys());
    for (let version = 1; version <= latestVersion; version += 1) {
      const brief = briefsByVersion.get(version);
      if (!brief) {
        failures.push({ version, reason: "Missing brief version in lineage chain." });
        continue;
      }
      if (version === 1) continue;

      const previous = briefsByVersion.get(version - 1);
      if (!previous) continue;

      const expectedArtifactId = projectBriefArtifactId(previous);
      if (brief.previousVersionArtifactId !== expectedArtifactId) {
        failures.push({
          version,
          reason: `Previous artifact reference ${brief.previousVersionArtifactId} does not match ${expectedArtifactId}.`,
        });
      }
      const expectedDigest = digestJsonEvidence(previous);
      if (brief.previousVersionDigest !== expectedDigest) {
        failures.push({
          version,
          reason: "Previous version digest does not match the persisted previous brief.",
        });
      }
    }

    return { briefId, latestVersion, valid: failures.length === 0, failures };
  }

  async recordDecision(input: {
    briefId: string;
    version: number;
    decision: ProjectBriefDecisionKind;
    operatorId: string;
    rationale: string;
    requestedRevisions?: string[] | null;
  }): Promise<SavedProjectBriefDecision> {
    const brief = await this.loadBrief(input.briefId, input.version);
    const decision = createProjectBriefDecision({
      brief,
      briefArtifactId: projectBriefArtifactId(brief),
      decision: input.decision,
      operatorId: input.operatorId,
      rationale: input.rationale,
      requestedRevisions: input.requestedRevisions ?? null,
    });
    const reference = await this.#store.saveProjectBriefDecision(decision);
    return { decision, reference };
  }

  async listDecisions(briefId: string): Promise<FoundryArtifactSummary[]> {
    const { artifacts } = await this.#store.list({
      kind: "project-brief-decision",
      briefId,
      limit: 500,
    });
    return artifacts;
  }

  async deriveBriefStatus(briefId: string): Promise<ProjectBriefStatus> {
    const latestVersion = await this.#latestVersion(briefId);
    const decisions = await this.listDecisions(briefId);
    const latestVersionDecisions = decisions
      .filter(({ briefVersion }) => briefVersion === latestVersion)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const latest = latestVersionDecisions[0];
    if (!latest) return "draft";

    const stored = await this.#store.load(latest.id);
    if (stored.kind !== "project-brief-decision") {
      throw new Error(`Artifact ${latest.id} is not a project brief decision.`);
    }
    if (stored.artifact.decision === "approve") return "approved";
    if (stored.artifact.decision === "reject") return "rejected";
    return "revision-requested";
  }

  async #latestVersion(briefId: string): Promise<number> {
    const versions = await this.listBriefVersions(briefId);
    const latest = versions[versions.length - 1];
    if (!latest) throw new Error(`Unknown brief: ${briefId}`);
    return latest.briefVersion;
  }
}
