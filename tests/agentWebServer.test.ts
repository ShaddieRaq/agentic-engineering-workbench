import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildAgentWebServer } from "../src/web/agentWebServer.js";
import { createConsoleTestService } from "./helpers/consoleTestService.js";
import { createAgentEvaluationExperiment } from "../src/agents/evaluations/agentEvaluationExperiment.js";
import { evaluationDatasetRun, evaluationVerification } from "./helpers/evaluationFixture.js";

async function waitForCompletion(app: Awaited<ReturnType<typeof buildAgentWebServer>>, id: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/operations/${id}` });
    const body = response.json();
    if (body.status === "completed" || body.status === "failed") return body;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Operation did not complete.");
}

describe("agent web server", () => {
  it("exposes read-only health, catalog, and schema information without credentials", async () => {
    const { service } = await createConsoleTestService(false);
    const app = await buildAgentWebServer({ service, apiKeyConfigured: false });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    const agent = await app.inject({ method: "GET", url: "/api/agents/console-test-agent" });
    const tools = await app.inject({ method: "GET", url: "/api/tools" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ apiKeyConfigured: false, catalogValid: true });
    expect(agent.json()).toMatchObject({
      manifest: { id: "console-test-agent" },
      inputSchema: { type: "object" },
    });
    expect(tools.json()).toEqual({ tools: [] });
    await app.close();
  });

  it("executes through the shared service and exposes persisted operation evidence", async () => {
    const { service, directory } = await createConsoleTestService();
    const project = await service.workspaces.add({
      id: "sample-project",
      name: "Sample Project",
      rootPath: await mkdtemp(`${directory}/project-`),
    });
    const app = await buildAgentWebServer({ service, apiKeyConfigured: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/agents/console-test-agent/runs",
      payload: { input: { instruction: "Run from HTTP." }, workspaceId: project.id },
    });

    expect(response.statusCode).toBe(202);
    const completed = await waitForCompletion(app, response.json().operationId);
    expect(completed).toMatchObject({
      status: "completed",
      result: { run: { configuration: { workspaceId: "sample-project" }, output: { answer: "Run from HTTP." } } },
    });
    const artifact = await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}`,
    });
    expect(artifact.json()).toMatchObject({ kind: "agent-run" });
    const presentation = await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}/presentation`,
    });
    expect(presentation.json()).toMatchObject({
      presentationKind: "generic",
      agentId: "console-test-agent",
    });
    const exported = await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}/export?format=markdown`,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(exported.body).toContain("# Console Test Agent Run");
    const raw = await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}/raw`,
    });
    expect(raw.statusCode).toBe(200);
    expect(raw.headers["content-disposition"]).toContain("raw.json");
    expect(JSON.parse(raw.body)).toMatchObject({ agentId: "console-test-agent" });
    expect((await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}/export?format=html`,
    })).statusCode).toBe(400);
    await app.close();
  });

  it("registers and removes local workspace boundaries", async () => {
    const { service, directory } = await createConsoleTestService();
    const projectRoot = await mkdtemp(`${directory}/project-`);
    const app = await buildAgentWebServer({ service, apiKeyConfigured: false });
    const added = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { id: "external-project", name: "External Project", rootPath: projectRoot },
    });
    expect(added.statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: "/api/workspaces" })).json().workspaces)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "external-project" })]));
    expect((await app.inject({ method: "DELETE", url: "/api/workspaces/external-project" })).statusCode).toBe(204);
    await app.close();
  });

  it("rejects non-loopback browser origins", async () => {
    const { service } = await createConsoleTestService();
    const app = await buildAgentWebServer({ service, apiKeyConfigured: true });
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://example.com" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("exposes evaluation history, case evidence, comparison, and a regression-case draft", async () => {
    const { service } = await createConsoleTestService();
    const saveEvaluation = async (id: string, outcomes: boolean[]) => {
      const datasetRun = evaluationDatasetRun(`${id}-dataset`, outcomes);
      const datasetReference = await service.artifacts.saveAgentDatasetRun(datasetRun);
      const experiment = createAgentEvaluationExperiment({
        experimentId: id,
        agentId: datasetRun.agentId,
        agentVersion: datasetRun.agentVersion,
        workspaceId: "fixture-workspace",
        model: "fake-model",
        repetitions: outcomes.length,
        concurrency: 1,
        datasets: [{ datasetRun, verification: evaluationVerification(datasetRun), artifactId: datasetReference.id }],
      });
      await service.artifacts.saveAgentEvaluation(experiment);
      return experiment;
    };
    await saveEvaluation("baseline-evaluation", [true, true]);
    await saveEvaluation("candidate-evaluation", [true, false]);
    const app = await buildAgentWebServer({ service, apiKeyConfigured: false });

    const history = await app.inject({ method: "GET", url: "/api/evaluations?agentId=evaluation-agent" });
    const detail = await app.inject({ method: "GET", url: "/api/evaluations/candidate-evaluation" });
    const datasetCase = await app.inject({ method: "GET", url: "/api/evaluations/candidate-evaluation/cases/evaluation-dataset/checkout-timeout" });
    const comparison = await app.inject({ method: "GET", url: "/api/evaluations/compare?baselineId=baseline-evaluation&candidateId=candidate-evaluation" });
    const draft = await app.inject({ method: "GET", url: "/api/evaluations/candidate-evaluation/cases/evaluation-dataset/checkout-timeout/draft" });

    expect(history.json().experiments).toHaveLength(2);
    expect(detail.json()).toMatchObject({ experiment: { experimentId: "candidate-evaluation" } });
    expect(datasetCase.json()).toMatchObject({ datasetCaseId: "checkout-timeout", totalRuns: 2 });
    expect(comparison.json()).toMatchObject({ summary: { regressedCases: 1 } });
    expect(draft.headers["content-disposition"]).toContain("dataset-case.json");
    expect(JSON.parse(draft.body)).toEqual({
      id: "checkout-timeout",
      input: { failureLog: "Timeout waiting for checkout." },
    });
    await app.close();
  });

  it("persists a read-only improvement proposal for a failed evaluation", async () => {
    const { service } = await createConsoleTestService();
    const datasetRun = evaluationDatasetRun("improvement-dataset", [false]);
    datasetRun.runs[0]!.expectation = { hiddenAnswer: "test-defect" };
    const datasetReference = await service.artifacts.saveAgentDatasetRun(datasetRun);
    const experiment = createAgentEvaluationExperiment({
      experimentId: "failed-improvement-source",
      agentId: datasetRun.agentId,
      agentVersion: datasetRun.agentVersion,
      workspaceId: "fixture-workspace",
      model: "fake-model",
      repetitions: 1,
      concurrency: 1,
      datasets: [
        {
          datasetRun,
          verification: evaluationVerification(datasetRun),
          artifactId: datasetReference.id,
        },
      ],
    });
    await service.artifacts.saveAgentEvaluation(experiment);
    const app = await buildAgentWebServer({ service, apiKeyConfigured: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/evaluations/failed-improvement-source/improvements",
      payload: { target: "reliability" },
    });
    const completed = await waitForCompletion(app, response.json().operationId);
    const artifact = await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}`,
    });
    const presentation = await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}/presentation`,
    });

    expect(response.statusCode).toBe(202);
    expect(completed).toMatchObject({
      kind: "agent-improvement",
      status: "completed",
      result: {
        analysis: {
          packet: { sourceExperimentIds: ["failed-improvement-source"] },
        },
      },
    });
    expect(JSON.stringify(completed.result.analysis.packet)).not.toContain(
      "hiddenAnswer",
    );
    expect(artifact.json()).toMatchObject({
      kind: "agent-improvement-proposal",
    });
    expect(presentation.json()).toMatchObject({
      presentationKind: "agent-improvement",
      agentId: "evaluation-agent",
      improvement: {
        sourceExperimentIds: ["failed-improvement-source"],
      },
    });
    await app.close();
  });
});
