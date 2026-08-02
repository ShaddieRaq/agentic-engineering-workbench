import { access, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { scaffoldAgent } from "../src/agents/agentScaffolder.js";

describe("scaffoldAgent", () => {
  it("creates the complete reviewed starting structure without registering code", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-scaffold-"));
    const result = await scaffoldAgent("my-first-agent", root);

    expect(result.createdPaths).toHaveLength(4);
    await expect(access(join(root, "src/agents/my-first-agent/myFirstAgentAgent.ts"))).resolves.toBeUndefined();
    expect(await readFile(join(root, "src/agents/my-first-agent/myFirstAgentDataset.ts"), "utf8"))
      .toContain("agentDatasetDefinitionSchema");
    expect(result.nextSteps).toContain("Register the agent in platformAgentRegistry.ts.");
  });

  it("refuses invalid IDs and existing scaffold files", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-scaffold-"));
    await expect(scaffoldAgent("Invalid Agent", root)).rejects.toThrow("kebab-case");
    await scaffoldAgent("safe-agent", root);
    await expect(scaffoldAgent("safe-agent", root)).rejects.toThrow("Refusing to overwrite");
  });
});
