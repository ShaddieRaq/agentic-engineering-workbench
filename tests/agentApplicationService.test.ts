import { describe, expect, it } from "vitest";
import { createConsoleTestService } from "./helpers/consoleTestService.js";

describe("AgentApplicationService", () => {
  it("shares catalog description and persisted execution across entry points", async () => {
    const { service } = await createConsoleTestService();

    const description = service.describeAgent("console-test-agent");
    const result = await service.run({
      agentId: "console-test-agent",
      input: { instruction: "Explain the platform." },
    });

    expect(description.inputSchema).toMatchObject({ type: "object" });
    expect(result.run.output).toEqual({ answer: "Explain the platform." });
    expect((await service.artifacts.load(result.artifactId)).kind).toBe("agent-run");
  });
});
