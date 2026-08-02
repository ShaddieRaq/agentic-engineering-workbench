import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { AgentRegistry } from "../src/agents/agentRegistry.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import { runAgent } from "../src/agents/agentRunner.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { z } from "zod";
import { createAgentEvaluationExperiment } from "../src/agents/evaluations/agentEvaluationExperiment.js";
import { evaluationDatasetRun, evaluationVerification } from "./helpers/evaluationFixture.js";

const agent = defineAgent({
  manifest: {
    id: "artifact-agent",
    name: "Artifact Agent",
    version: "1.0.0",
    status: "active",
    description: "Produces artifact fixtures.",
    owner: "tests",
    tags: [],
    defaultModel: "fake",
    components: { workflowIds: [], harnessIds: [], scenarioIds: [], datasetIds: [] },
    permissions: { toolIds: [] },
    verification: { datasetIds: [], minimumPassRate: null },
  },
  inputSchema: z.object({ instruction: z.string() }).strict(),
  outputSchema: z.object({ answer: z.string() }).strict(),
  async execute(input) { return { answer: input.instruction }; },
});

describe("FileArtifactStore", () => {
  it("writes, lists, filters, and reloads validated agent evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-artifacts-"));
    const store = new FileArtifactStore(directory);
    const run = await runAgent("artifact-agent", { instruction: "Inspect this." }, {
      agents: new AgentRegistry([agent]),
      tools: new ToolRegistry([]),
      provider: new FakeProvider("unused"),
      workspaceRoot: directory,
      workspaceId: "artifact-workspace",
    });

    const reference = await store.saveAgentRun(run);
    const listed = await store.list({ agentId: "artifact-agent", workspaceId: "artifact-workspace", succeeded: true });
    const loaded = await store.load(reference.id);

    expect(listed.rejected).toEqual([]);
    expect(listed.artifacts).toEqual([
      expect.objectContaining({ id: run.agentRunId, kind: "agent-run", workspaceId: "artifact-workspace", succeeded: true }),
    ]);
    expect(loaded).toEqual({ kind: "agent-run", artifact: run });
  });

  it("rejects unsafe artifact identifiers", async () => {
    const store = new FileArtifactStore(await mkdtemp(join(tmpdir(), "agent-artifacts-")));
    await expect(store.load("../outside")).rejects.toThrow("unsupported characters");
  });

  it("persists an evaluation as a small immutable index over dataset evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-artifacts-"));
    const store = new FileArtifactStore(directory);
    const datasetRun = evaluationDatasetRun("dataset-reference", [true]);
    await store.saveAgentDatasetRun(datasetRun);
    const experiment = createAgentEvaluationExperiment({
      experimentId: "evaluation-reference",
      agentId: datasetRun.agentId,
      agentVersion: datasetRun.agentVersion,
      workspaceId: "fixture-workspace",
      model: "fake-model",
      repetitions: 1,
      concurrency: 1,
      datasets: [{ datasetRun, verification: evaluationVerification(datasetRun), artifactId: datasetRun.datasetRunId }],
    });

    const reference = await store.saveAgentEvaluation(experiment);

    expect(reference.kind).toBe("agent-evaluation");
    expect(await store.load(reference.id)).toEqual({ kind: "agent-evaluation", artifact: experiment });
    expect((await store.list({ kind: "agent-evaluation" })).artifacts).toEqual([
      expect.objectContaining({ id: experiment.experimentId, succeeded: true }),
    ]);
  });
});
