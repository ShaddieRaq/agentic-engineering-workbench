import { describe, expect, it } from "vitest";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { runAgent } from "../src/agents/agentRunner.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import {
  inspectGitDiffInputSchema,
  inspectGitDiffOutputSchema,
} from "../src/tools/inspectGitDiffTool.js";
import {
  inspectPackageInputSchema,
  inspectPackageOutputSchema,
} from "../src/tools/inspectPackageTool.js";
import {
  listFilesInputSchema,
  listFilesOutputSchema,
} from "../src/tools/listFilesTool.js";
import {
  readFileInputSchema,
  readFileOutputSchema,
} from "../src/tools/readFileTool.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";

describe("changeRiskReviewerAgent", () => {
  it("registers a second independently versioned agent product", () => {
    expect(platformAgentRegistry.list().map(({ id }) => id)).toEqual([
      "change-risk-reviewer",
      "documentation-auditor",
      "repository-assistant",
    ]);
    expect(platformAgentRegistry.get("change-risk-reviewer").manifest)
      .toMatchObject({
        version: "1.0.0",
        components: { workflowIds: ["change-risk-review"] },
        verification: {
          datasetIds: ["change-risk-reviewer-smoke"],
          minimumPassRate: 1,
        },
      });
  });

  it("runs end to end through shared tools, workflow, provider, and evidence", async () => {
    const tools = new ToolRegistry([
      {
        id: "inspect-package",
        description: "Package evidence.",
        inputSchema: inspectPackageInputSchema,
        outputSchema: inspectPackageOutputSchema,
        async execute() {
          return {
            path: "package.json",
            name: "example",
            version: "1.0.0",
            moduleType: "module" as const,
            scripts: {},
            dependencies: {},
            devDependencies: {},
          };
        },
      },
      {
        id: "list-files",
        description: "Repository files.",
        inputSchema: listFilesInputSchema,
        outputSchema: listFilesOutputSchema,
        async execute() {
          return {
            entries: [{ path: "package.json", type: "file" as const }],
            truncated: false,
          };
        },
      },
      {
        id: "inspect-git-diff",
        description: "Change evidence.",
        inputSchema: inspectGitDiffInputSchema,
        outputSchema: inspectGitDiffOutputSchema,
        async execute() {
          return {
            mode: "working-tree" as const,
            diff: "+ changed",
            sizeBytes: 9,
            empty: false,
            trackedPaths: ["src/changed.ts"],
            untrackedPaths: [],
          };
        },
      },
      {
        id: "read-file",
        description: "File evidence.",
        inputSchema: readFileInputSchema,
        outputSchema: readFileOutputSchema,
        async execute(input) {
          const content = input.path === "src/changed.ts"
            ? "export const changed = true;"
            : '{"name":"example"}';
          return {
            path: input.path,
            content,
            sizeBytes: Buffer.byteLength(content),
          };
        },
      },
    ]);
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured review",
          parsedOutput: {
            summary: "The observed change has focused correctness risk.",
            overallRisk: "medium",
            findings: [
              {
                title: "Changed export",
                severity: "medium",
                category: "correctness",
                explanation: "An exported value changed.",
                evidencePaths: ["src/changed.ts"],
                recommendedAction: "Review dependent callers.",
              },
            ],
            missingTests: [
              {
                recommendation: "Add a regression test for the changed export.",
                evidencePaths: ["src/changed.ts"],
              },
            ],
            releaseRecommendation: "caution",
          } as TOutput,
          refusal: null,
          provider: { model: "fake-judge", usage: null },
        };
      },
    };

    const result = await runAgent(
      "change-risk-reviewer",
      {},
      {
        agents: platformAgentRegistry,
        tools,
        provider,
        workspaceRoot: "/workspace",
      },
    );

    expect(result).toMatchObject({
      agentId: "change-risk-reviewer",
      succeeded: true,
      assessment: {
        passed: true,
        message: "Change-risk review completed with grounded evidence.",
      },
      output: {
        succeeded: true,
        overallRisk: "medium",
        releaseRecommendation: "caution",
      },
    });
  });
});
