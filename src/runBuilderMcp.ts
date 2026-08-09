import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createProcessGitInspector } from "./foundry/buildCompletionService.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import {
  createProcessSubmissionRunner,
  SubmissionService,
} from "./foundry/submissionService.js";
import type { TestSuite } from "./foundry/testSuite.js";
import { WorkOrderService } from "./foundry/workOrderService.js";
import { buildBuilderMcpServer } from "./mcp/builderMcpServer.js";

// The builder server is keyless and provider-free: every exposed operation
// is deterministic. The project root is pinned by the scaffolded
// workspace's .mcp.json env so the builder cannot aim Workbench-process
// writes at arbitrary paths.
async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const projectRoot = process.env.BUILDER_PROJECT_ROOT;
  if (!projectRoot) {
    throw new Error(
      "BUILDER_PROJECT_ROOT is not set. Builder MCP servers are started from a scaffolded workspace's .mcp.json, which pins the project root.",
    );
  }

  const packageJson = JSON.parse(
    await readFile(resolve(workspaceRoot, "package.json"), "utf8"),
  ) as { version?: string };

  const store = new FoundryArtifactStore(resolve(workspaceRoot, "runs/foundry"));
  // Thin store-backed suite loader (mirrors TestDesignService.loadTestSuite)
  // so the keyless builder server never constructs provider-bearing services.
  const testDesign = {
    async loadTestSuite(testSuiteId: string): Promise<TestSuite> {
      const stored = await store.load(testSuiteId);
      if (stored.kind !== "test-suite") {
        throw new Error(`Artifact ${testSuiteId} is not a test suite.`);
      }
      return stored.artifact;
    },
    async deriveTestSuiteStatus(): Promise<
      "draft" | "approved" | "rejected" | "revision-requested"
    > {
      throw new Error("Suite status is not part of the builder channel.");
    },
  };
  const workOrders = new WorkOrderService({
    testDesign,
    architect: {
      async loadPlan() {
        throw new Error("Plans are not part of the builder channel.");
      },
    },
    briefs: {
      async loadBrief() {
        throw new Error("Briefs are not part of the builder channel.");
      },
    },
    store,
  });
  const submissions = new SubmissionService({
    workOrders,
    testDesign,
    store,
    runner: createProcessSubmissionRunner(),
    isolationRoot: resolve(workspaceRoot, ".workbench", "verification"),
    git: createProcessGitInspector(),
  });

  const server = buildBuilderMcpServer(
    {
      store,
      workOrders,
      submissions,
      testDesign,
      projectRoot: resolve(projectRoot),
      // Structural confinement: every tool call verifies the workspace's
      // guardrails are intact and fails closed otherwise.
      workbenchRoot: workspaceRoot,
    },
    packageJson.version ?? "0.0.0",
  );

  await server.connect(new StdioServerTransport());
  console.error(
    `Workbench builder MCP server connected for project ${resolve(projectRoot)}.`,
  );
}

main().catch((error: unknown) => {
  console.error("Builder MCP server failed:", error);
  process.exit(1);
});
