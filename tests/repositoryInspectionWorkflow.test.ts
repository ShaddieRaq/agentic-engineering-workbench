import { z } from "zod";
import { describe, expect, it } from "vitest";
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
import type { ToolDefinition } from "../src/tools/toolDefinition.js";
import {
  runRepositoryInspectionWorkflow,
  type RepositoryInspectionTools,
} from "../src/workflows/repositoryInspectionWorkflow.js";

function createTools(
  executionOrder: string[],
  failingStep?: keyof RepositoryInspectionTools,
): RepositoryInspectionTools {
  function tool<TInput, TOutput>(
    id: keyof RepositoryInspectionTools,
    inputSchema: z.ZodType<TInput>,
    outputSchema: z.ZodType<TOutput>,
    output: TOutput,
  ): ToolDefinition<TInput, TOutput> {
    return {
      id,
      description: id,
      inputSchema,
      outputSchema,
      async execute(): Promise<TOutput> {
        executionOrder.push(id);

        if (failingStep === id) {
          throw new Error(`${id} failed.`);
        }

        return output;
      },
    };
  }

  return {
    packageMetadata: tool(
      "packageMetadata",
      inspectPackageInputSchema,
      inspectPackageOutputSchema,
      {
        path: "package.json",
        name: "test-project",
        version: "1.0.0",
        moduleType: "module",
        scripts: {},
        dependencies: {},
        devDependencies: {},
      },
    ),
    repositoryFiles: tool(
      "repositoryFiles",
      listFilesInputSchema,
      listFilesOutputSchema,
      { entries: [], truncated: false },
    ),
    gitChanges: tool(
      "gitChanges",
      inspectGitDiffInputSchema,
      inspectGitDiffOutputSchema,
      {
        mode: "working-tree",
        diff: "",
        sizeBytes: 0,
        empty: true,
        untrackedPaths: [],
      },
    ),
  };
}

describe("runRepositoryInspectionWorkflow", () => {
  it("runs the explicit inspection steps and preserves their evidence", async () => {
    const executionOrder: string[] = [];
    const result = await runRepositoryInspectionWorkflow(
      createTools(executionOrder),
    );

    expect(executionOrder).toEqual([
      "packageMetadata",
      "repositoryFiles",
      "gitChanges",
    ]);
    expect(result.workflowId).toBe("repository-inspection");
    expect(result.steps.map((step) => step.stepId)).toEqual([
      "package-metadata",
      "repository-files",
      "git-changes",
    ]);
    expect(result.steps.every((step) => step.evidence.succeeded)).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.completedAt).toString()).not.toBe("Invalid Date");
  });

  it("continues independent inspection after one step fails", async () => {
    const executionOrder: string[] = [];
    const result = await runRepositoryInspectionWorkflow(
      createTools(executionOrder, "packageMetadata"),
    );

    expect(executionOrder).toEqual([
      "packageMetadata",
      "repositoryFiles",
      "gitChanges",
    ]);
    expect(result.steps[0]?.evidence.failure).toMatchObject({
      category: "execution",
      message: "packageMetadata failed.",
    });
    expect(result.steps[1]?.evidence.succeeded).toBe(true);
    expect(result.steps[2]?.evidence.succeeded).toBe(true);
    expect(result.succeeded).toBe(false);
  });
});
