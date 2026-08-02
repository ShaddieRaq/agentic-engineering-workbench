import { describe, expect, it } from "vitest";
import { buildAgentWebServer } from "../src/web/agentWebServer.js";
import { createConsoleTestService } from "./helpers/consoleTestService.js";

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

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ apiKeyConfigured: false, catalogValid: true });
    expect(agent.json()).toMatchObject({
      manifest: { id: "console-test-agent" },
      inputSchema: { type: "object" },
    });
    await app.close();
  });

  it("executes through the shared service and exposes persisted operation evidence", async () => {
    const { service } = await createConsoleTestService();
    const app = await buildAgentWebServer({ service, apiKeyConfigured: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/agents/console-test-agent/runs",
      payload: { input: { instruction: "Run from HTTP." } },
    });

    expect(response.statusCode).toBe(202);
    const completed = await waitForCompletion(app, response.json().operationId);
    expect(completed).toMatchObject({
      status: "completed",
      result: { run: { output: { answer: "Run from HTTP." } } },
    });
    const artifact = await app.inject({
      method: "GET",
      url: `/api/artifacts/${completed.result.artifactId}`,
    });
    expect(artifact.json()).toMatchObject({ kind: "agent-run" });
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
});
