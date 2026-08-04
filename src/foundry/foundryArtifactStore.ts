import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { projectBriefSchema, type ProjectBrief } from "./projectBrief.js";
import {
  projectBriefDecisionSchema,
  type ProjectBriefDecision,
} from "./projectBriefDecision.js";

const MAXIMUM_ARTIFACT_BYTES = 8 * 1024 * 1024;

export type FoundryArtifactKind = "project-brief" | "project-brief-decision";

export interface FoundryArtifactReference {
  id: string;
  kind: FoundryArtifactKind;
  path: string;
}

export type FoundryStoredArtifact =
  | { kind: "project-brief"; artifact: ProjectBrief }
  | { kind: "project-brief-decision"; artifact: ProjectBriefDecision };

export interface FoundryArtifactSummary {
  id: string;
  kind: FoundryArtifactKind;
  path: string;
  briefId: string;
  briefVersion: number;
  createdAt: string;
}

export interface FoundryArtifactQuery {
  kind?: FoundryArtifactKind;
  briefId?: string;
  limit?: number;
}

export interface FoundryArtifactListResult {
  artifacts: FoundryArtifactSummary[];
  rejected: { path: string; reason: string }[];
}

interface FoundryKindDefinition {
  parse(value: unknown): FoundryStoredArtifact;
  summarize(id: string, path: string, stored: FoundryStoredArtifact): FoundryArtifactSummary;
}

const kindDefinitions: Record<FoundryArtifactKind, FoundryKindDefinition> = {
  "project-brief": {
    parse: (value) => ({
      kind: "project-brief",
      artifact: projectBriefSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const brief = stored.artifact as ProjectBrief;
      return {
        id,
        kind: "project-brief",
        path,
        briefId: brief.briefId,
        briefVersion: brief.version,
        createdAt: brief.createdAt,
      };
    },
  },
  "project-brief-decision": {
    parse: (value) => ({
      kind: "project-brief-decision",
      artifact: projectBriefDecisionSchema.parse(value),
    }),
    summarize: (id, path, stored) => {
      const decision = stored.artifact as ProjectBriefDecision;
      return {
        id,
        kind: "project-brief-decision",
        path,
        briefId: decision.briefId,
        briefVersion: decision.briefVersion,
        createdAt: decision.decidedAt,
      };
    },
  },
};

// The decision pattern must be tested before the brief pattern because
// "project-brief-" is a prefix of "project-brief-decision-".
const orderedKinds: FoundryArtifactKind[] = [
  "project-brief-decision",
  "project-brief",
];

function descriptor(
  fileName: string,
): { kind: FoundryArtifactKind; id: string } | null {
  for (const kind of orderedKinds) {
    const match = new RegExp(`^${kind}-([a-zA-Z0-9-]+)\\.json$`).exec(fileName);
    if (match?.[1]) return { kind, id: match[1] };
  }
  return null;
}

export function projectBriefArtifactId(brief: ProjectBrief): string {
  return `${brief.briefId}-v${brief.version}`;
}

export class FoundryArtifactStore {
  readonly #root: string;

  constructor(runsDirectory = "runs/foundry") {
    this.#root = resolve(runsDirectory);
  }

  async saveProjectBrief(brief: ProjectBrief): Promise<FoundryArtifactReference> {
    const validated = projectBriefSchema.parse(brief);
    return this.#write("project-brief", projectBriefArtifactId(validated), validated);
  }

  async saveProjectBriefDecision(
    decision: ProjectBriefDecision,
  ): Promise<FoundryArtifactReference> {
    const validated = projectBriefDecisionSchema.parse(decision);
    return this.#write("project-brief-decision", validated.decisionId, validated);
  }

  async load(id: string): Promise<FoundryStoredArtifact> {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      throw new Error("Artifact ID contains unsupported characters.");
    }

    for (const kind of orderedKinds) {
      try {
        return await this.#read(join(this.#root, `${kind}-${id}.json`), kind);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    throw new Error(`Unknown foundry artifact: ${id}`);
  }

  async list(query: FoundryArtifactQuery = {}): Promise<FoundryArtifactListResult> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    let names: string[];

    try {
      names = await readdir(this.#root);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { artifacts: [], rejected: [] };
      }
      throw error;
    }

    const artifacts: FoundryArtifactSummary[] = [];
    const rejected: FoundryArtifactListResult["rejected"] = [];

    for (const name of names.sort()) {
      const identified = descriptor(name);
      if (!identified || (query.kind && query.kind !== identified.kind)) continue;
      const path = join(this.#root, name);

      try {
        const stored = await this.#read(path, identified.kind);
        const item = kindDefinitions[identified.kind].summarize(
          identified.id,
          path,
          stored,
        );
        if (query.briefId && item.briefId !== query.briefId) continue;
        artifacts.push(item);
      } catch (error: unknown) {
        rejected.push({
          path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    artifacts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { artifacts: artifacts.slice(0, limit), rejected };
  }

  async #write(
    kind: FoundryArtifactKind,
    id: string,
    artifact: ProjectBrief | ProjectBriefDecision,
  ): Promise<FoundryArtifactReference> {
    await mkdir(this.#root, { recursive: true });
    const path = join(this.#root, `${kind}-${id}.json`);
    await writeFile(path, JSON.stringify(artifact, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    return { id, kind, path };
  }

  async #read(
    path: string,
    kind: FoundryArtifactKind,
  ): Promise<FoundryStoredArtifact> {
    if (resolve(path) !== join(this.#root, basename(path))) {
      throw new Error("Artifact path escapes the configured foundry directory.");
    }
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("Artifact path is not a file.");
    if (metadata.size > MAXIMUM_ARTIFACT_BYTES) {
      throw new Error(`Artifact exceeds ${MAXIMUM_ARTIFACT_BYTES} bytes.`);
    }
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return kindDefinitions[kind].parse(parsed);
  }
}
