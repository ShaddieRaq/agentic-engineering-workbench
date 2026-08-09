import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareBuilderWorkspace,
  verifyWorkspaceIntegrity,
} from "../src/foundry/builderWorkspace.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import type { TestSuite } from "../src/foundry/testSuite.js";
import { WorkOrderService } from "../src/foundry/workOrderService.js";
import {
  persistFoundryChain,
  persistSliceTwoWorkOrder,
} from "./helpers/foundryWebFixture.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

async function workspaceHarness() {
  const storeDirectory = await mkdtemp(join(tmpdir(), "builder-ws-store-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "builder-ws-project-"));
  createdDirectories.push(storeDirectory, projectRoot);

  const store = new FoundryArtifactStore(storeDirectory);
  const chain = await persistFoundryChain(store);
  const { workOrderId } = await persistSliceTwoWorkOrder(store, chain);

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
      throw new Error("Not needed.");
    },
  };
  const workOrders = new WorkOrderService({
    testDesign,
    architect: {
      async loadPlan() {
        throw new Error("Not needed.");
      },
    },
    briefs: {
      async loadBrief() {
        throw new Error("Not needed.");
      },
    },
    store,
  });

  return { store, chain, workOrderId, projectRoot, workOrders, testDesign };
}

const WORKBENCH_ROOT = "/fake/workbench/root";

describe("prepareBuilderWorkspace", () => {
  it("writes isolation settings, pinned MCP wiring, and a redacted BUILDER.md", async () => {
    const harness = await workspaceHarness();
    const prepared = await prepareBuilderWorkspace(
      { workOrders: harness.workOrders, testDesign: harness.testDesign },
      {
        workOrderId: harness.workOrderId,
        projectRoot: harness.projectRoot,
        workbenchRoot: WORKBENCH_ROOT,
      },
    );

    // The scaffold initializes the repository the sandbox forbids the
    // builder from creating.
    expect(existsSync(join(harness.projectRoot, ".git"))).toBe(true);
    expect(prepared.writtenConfigFiles).toEqual([
      ".mcp.json",
      ".claude/settings.json",
      "BUILDER.md",
    ]);
    expect(prepared.writtenTestFiles.sort()).toEqual(
      [
        harness.chain.fixture.filePaths.visibleOnly,
        harness.chain.fixture.filePaths.crossSlice,
      ].sort(),
    );

    const settings = JSON.parse(
      await readFile(join(harness.projectRoot, ".claude/settings.json"), "utf8"),
    );
    expect(settings).toEqual({
      permissions: {
        deny: [
          `Read(//fake/workbench/root/**)`,
          "Edit(.claude/**)",
          "Edit(.mcp.json)",
          "Edit(acceptance-tests/**)",
          `Bash(cd ${WORKBENCH_ROOT}*)`,
          `Bash(*${WORKBENCH_ROOT}*)`,
          "Bash(*npm run foundry*)",
          "Bash(*runFoundry*)",
        ],
      },
      sandbox: {
        enabled: true,
        filesystem: {
          denyRead: [`${WORKBENCH_ROOT}/**`],
          allowRead: ["."],
        },
        allowUnsandboxedCommands: false,
      },
    });

    const mcp = JSON.parse(
      await readFile(join(harness.projectRoot, ".mcp.json"), "utf8"),
    );
    expect(mcp.mcpServers["workbench-builder"]).toEqual({
      type: "stdio",
      command: "npm",
      args: ["--prefix", WORKBENCH_ROOT, "run", "--silent", "mcp:builder"],
      env: {
        BUILDER_PROJECT_ROOT: harness.projectRoot,
        BUILDER_BRIEF_ID: harness.chain.fixture.brief.briefId,
      },
    });

    const readme = await readFile(
      join(harness.projectRoot, "BUILDER.md"),
      "utf8",
    );
    expect(readme).toContain(prepared.workOrder.sliceTitle);
    expect(readme).toContain(harness.chain.fixture.filePaths.visibleOnly);
    expect(readme).toContain("1 withheld holdout test file(s)");
    expect(readme).not.toContain(harness.chain.fixture.filePaths.holdout);

    // The holdout is never materialized by preparation.
    await expect(
      access(join(harness.projectRoot, harness.chain.fixture.filePaths.holdout)),
    ).rejects.toThrowError();
  });

  it("verifies workspace integrity and fails closed on tampering (v1.2 confinement)", async () => {
    const harness = await workspaceHarness();
    await prepareBuilderWorkspace(
      { workOrders: harness.workOrders, testDesign: harness.testDesign },
      {
        workOrderId: harness.workOrderId,
        projectRoot: harness.projectRoot,
        workbenchRoot: WORKBENCH_ROOT,
      },
    );

    // A freshly scaffolded workspace passes.
    const intact = await verifyWorkspaceIntegrity({
      projectRoot: harness.projectRoot,
      workbenchRoot: WORKBENCH_ROOT,
    });
    expect(intact).toEqual({ ok: true, problems: [] });

    // Removing one deny entry is detected by name.
    const settingsPath = join(harness.projectRoot, ".claude", "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      permissions: { deny: string[] };
    };
    settings.permissions.deny = settings.permissions.deny.filter(
      (entry) => !entry.startsWith("Read("),
    );
    await writeFile(settingsPath, JSON.stringify(settings), "utf8");
    const tampered = await verifyWorkspaceIntegrity({
      projectRoot: harness.projectRoot,
      workbenchRoot: WORKBENCH_ROOT,
    });
    expect(tampered.ok).toBe(false);
    expect(tampered.problems.join(" ")).toContain("deny entry is absent");

    // A missing settings file fails closed, as does a lost root pin.
    await rm(settingsPath);
    const missing = await verifyWorkspaceIntegrity({
      projectRoot: harness.projectRoot,
      workbenchRoot: WORKBENCH_ROOT,
    });
    expect(missing.ok).toBe(false);
    expect(missing.problems.join(" ")).toContain("settings.json is missing");

    const otherRoot = await verifyWorkspaceIntegrity({
      projectRoot: join(harness.projectRoot, "elsewhere"),
      workbenchRoot: WORKBENCH_ROOT,
    });
    expect(otherRoot.ok).toBe(false);
  });

  it("merges .mcp.json preserving foreign servers and reruns idempotently", async () => {
    const harness = await workspaceHarness();
    await writeFile(
      join(harness.projectRoot, ".mcp.json"),
      `${JSON.stringify(
        { mcpServers: { "project-own-server": { type: "stdio", command: "deno" } } },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const run = () =>
      prepareBuilderWorkspace(
        { workOrders: harness.workOrders, testDesign: harness.testDesign },
        {
          workOrderId: harness.workOrderId,
          projectRoot: harness.projectRoot,
          workbenchRoot: WORKBENCH_ROOT,
        },
      );
    await run();
    await run();

    const mcp = JSON.parse(
      await readFile(join(harness.projectRoot, ".mcp.json"), "utf8"),
    );
    expect(Object.keys(mcp.mcpServers).sort()).toEqual([
      "project-own-server",
      "workbench-builder",
    ]);
    expect(mcp.mcpServers["project-own-server"]).toEqual({
      type: "stdio",
      command: "deno",
    });
  });
});
