import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { runAgent } from "../src/agents/agentRunner.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import { createPlatformToolRegistry } from "../src/tools/toolRegistry.js";

describe("DocumentationAuditor", () => {
  it("audits local documentation through bounded tools and citation validation", async () => {
    const root = await mkdtemp(join(tmpdir(), "documentation-auditor-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "Run npm run old-command.");
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    await writeFile(join(root, "src", "index.ts"), "export const active = true;");
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured audit",
          parsedOutput: {
            overview: "The README contains one stale command.",
            findings: [{
              title: "Unknown command",
              category: "stale",
              severity: "high",
              explanation: "The documented command is absent from package scripts.",
              evidencePaths: ["README.md", "package.json"],
              recommendation: "Replace it with a registered command.",
            }],
            coverageGaps: [],
            prioritizedActions: ["Correct the README command."],
          } as TOutput,
          refusal: null,
          provider: { model: "fake", usage: null },
        };
      },
    };
    const result = await runAgent("documentation-auditor", {}, {
      agents: platformAgentRegistry,
      tools: createPlatformToolRegistry(root),
      provider,
      workspaceRoot: root,
      workspaceId: "fixture",
    });
    expect(result).toMatchObject({
      succeeded: true,
      configuration: { workspaceId: "fixture" },
      output: {
        overview: "The README contains one stale command.",
        findings: [{ category: "stale" }],
      },
    });
  });
});
