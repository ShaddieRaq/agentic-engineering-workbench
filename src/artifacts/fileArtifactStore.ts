import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  agentDatasetRunResultSchema,
  type AgentDatasetRunResult,
} from "../agents/datasets/agentDatasetRunner.js";
import {
  agentRunResultSchema,
  type AgentRunResult,
} from "../agents/agentRunResult.js";
import {
  agentEvaluationExperimentSchema,
  type AgentEvaluationExperiment,
} from "../agents/evaluations/agentEvaluationExperiment.js";
import type {
  ArtifactKind,
  ArtifactListResult,
  ArtifactQuery,
  ArtifactReference,
  ArtifactStore,
  ArtifactSummary,
  StoredArtifact,
} from "./artifactStore.js";

const MAXIMUM_ARTIFACT_BYTES = 8 * 1024 * 1024;

function descriptor(fileName: string): { kind: ArtifactKind; id: string } | null {
  const evaluationMatch = /^agent-evaluation-([a-zA-Z0-9-]+)\.json$/.exec(fileName);
  if (evaluationMatch?.[1]) {
    return { kind: "agent-evaluation", id: evaluationMatch[1] };
  }

  const datasetMatch = /^agent-dataset-run-([a-zA-Z0-9-]+)\.json$/.exec(fileName);
  if (datasetMatch?.[1]) {
    return { kind: "agent-dataset-run", id: datasetMatch[1] };
  }

  const runMatch = /^agent-run-([a-zA-Z0-9-]+)\.json$/.exec(fileName);
  return runMatch?.[1] ? { kind: "agent-run", id: runMatch[1] } : null;
}

function summary(
  kind: ArtifactKind,
  path: string,
  artifact: AgentRunResult | AgentDatasetRunResult | AgentEvaluationExperiment,
): ArtifactSummary {
  if (kind === "agent-run") {
    const run = artifact as AgentRunResult;
    return {
      id: run.agentRunId,
      kind,
      path,
      agentId: run.agentId,
      agentVersion: run.agentVersion,
      workspaceId: run.configuration.workspaceId ?? null,
      completedAt: run.completedAt,
      succeeded: run.succeeded,
    };
  }

  if (kind === "agent-evaluation") {
    const evaluation = artifact as AgentEvaluationExperiment;
    return {
      id: evaluation.experimentId,
      kind,
      path,
      agentId: evaluation.agentId,
      agentVersion: evaluation.agentVersion,
      workspaceId: evaluation.workspaceId,
      completedAt: evaluation.completedAt,
      succeeded: evaluation.passed,
    };
  }

  const dataset = artifact as AgentDatasetRunResult;
  const workspaceIds = new Set(
    dataset.runs.map(({ agentRun }) => agentRun.configuration.workspaceId).filter((id): id is string => Boolean(id)),
  );
  return {
    id: dataset.datasetRunId,
    kind,
    path,
    agentId: dataset.agentId,
    agentVersion: dataset.agentVersion,
    workspaceId: workspaceIds.size === 1 ? [...workspaceIds][0]! : null,
    completedAt: dataset.completedAt,
    succeeded: dataset.caseSummaries.every(({ failedRuns }) => failedRuns === 0),
  };
}

export class FileArtifactStore implements ArtifactStore {
  readonly #root: string;

  constructor(runsDirectory = "runs") {
    this.#root = resolve(runsDirectory);
  }

  async saveAgentRun(result: AgentRunResult): Promise<ArtifactReference> {
    const validated = agentRunResultSchema.parse(result);
    return this.#write(
      "agent-run",
      validated.agentRunId,
      `agent-run-${validated.agentRunId}.json`,
      validated,
    );
  }

  async saveAgentDatasetRun(
    result: AgentDatasetRunResult,
  ): Promise<ArtifactReference> {
    const validated = agentDatasetRunResultSchema.parse(result);
    return this.#write(
      "agent-dataset-run",
      validated.datasetRunId,
      `agent-dataset-run-${validated.datasetRunId}.json`,
      validated,
    );
  }

  async saveAgentEvaluation(
    result: AgentEvaluationExperiment,
  ): Promise<ArtifactReference> {
    const validated = agentEvaluationExperimentSchema.parse(result);
    return this.#write(
      "agent-evaluation",
      validated.experimentId,
      `agent-evaluation-${validated.experimentId}.json`,
      validated,
    );
  }

  async list(query: ArtifactQuery = {}): Promise<ArtifactListResult> {
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

    const artifacts: ArtifactSummary[] = [];
    const rejected: ArtifactListResult["rejected"] = [];

    for (const name of names.sort()) {
      const identified = descriptor(name);
      if (!identified || (query.kind && query.kind !== identified.kind)) continue;
      const path = join(this.#root, name);

      try {
        const stored = await this.#read(path, identified.kind);
        const item = summary(identified.kind, path, stored.artifact);
        if (query.agentId && item.agentId !== query.agentId) continue;
        if (query.workspaceId && item.workspaceId !== query.workspaceId) continue;
        if (query.succeeded !== undefined && item.succeeded !== query.succeeded) continue;
        artifacts.push(item);
      } catch (error: unknown) {
        rejected.push({
          path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    artifacts.sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    return { artifacts: artifacts.slice(0, limit), rejected };
  }

  async load(id: string): Promise<StoredArtifact> {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      throw new Error("Artifact ID contains unsupported characters.");
    }

    for (const [kind, name] of [
      ["agent-run", `agent-run-${id}.json`],
      ["agent-dataset-run", `agent-dataset-run-${id}.json`],
      ["agent-evaluation", `agent-evaluation-${id}.json`],
    ] as const) {
      try {
        return await this.#read(join(this.#root, name), kind);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    throw new Error(`Unknown artifact: ${id}`);
  }

  async #write(
    kind: ArtifactKind,
    id: string,
    fileName: string,
    artifact: AgentRunResult | AgentDatasetRunResult | AgentEvaluationExperiment,
  ): Promise<ArtifactReference> {
    await mkdir(this.#root, { recursive: true });
    const path = join(this.#root, fileName);
    await writeFile(path, JSON.stringify(artifact, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    return { id, kind, path };
  }

  async #read(path: string, kind: ArtifactKind): Promise<StoredArtifact> {
    if (resolve(path) !== join(this.#root, basename(path))) {
      throw new Error("Artifact path escapes the configured runs directory.");
    }
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("Artifact path is not a file.");
    if (metadata.size > MAXIMUM_ARTIFACT_BYTES) {
      throw new Error(`Artifact exceeds ${MAXIMUM_ARTIFACT_BYTES} bytes.`);
    }
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (kind === "agent-run") {
      return { kind, artifact: agentRunResultSchema.parse(parsed) };
    }
    if (kind === "agent-dataset-run") {
      return { kind, artifact: agentDatasetRunResultSchema.parse(parsed) };
    }
    return { kind, artifact: agentEvaluationExperimentSchema.parse(parsed) };
  }
}
