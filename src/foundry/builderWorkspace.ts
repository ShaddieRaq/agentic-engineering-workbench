import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  redactWorkOrder,
  type BuilderWorkOrderView,
} from "../mcp/builderMcpTools.js";
import type { TestDesignService } from "./testDesignService.js";
import type { WorkOrderService } from "./workOrderService.js";

export interface BuilderWorkspaceDependencies {
  workOrders: Pick<WorkOrderService, "loadWorkOrder" | "materializeVisibleTests">;
  testDesign: Pick<TestDesignService, "loadTestSuite">;
}

export interface PreparedBuilderWorkspace {
  projectRoot: string;
  writtenTestFiles: string[];
  writtenConfigFiles: string[];
  workOrder: BuilderWorkOrderView;
}

// Isolation settings are Workbench-owned generated artifacts: overwritten on
// every prepare so a stale workspace regains its guardrails. Deny rules win
// over every settings scope; the sandbox contains subprocess reads. The
// Write-tool gap and verification-executes-builder-code residuals are
// documented in Decision 087.
function builderSettings(workbenchRoot: string): unknown {
  return {
    permissions: {
      deny: [
        `Read(//${workbenchRoot.replace(/^\//, "")}/**)`,
        "Edit(.claude/**)",
        "Edit(.mcp.json)",
        "Edit(acceptance-tests/**)",
        // Incident 2026-08-08: the builder invoked the workbench CLI via
        // shell and forged an operator decision. Deny patterns are
        // defense-in-depth; the enforced backstop is the CLI's
        // interactive-terminal guard on all decision commands.
        `Bash(cd ${workbenchRoot}*)`,
        `Bash(*${workbenchRoot}*)`,
        "Bash(*npm run foundry*)",
        "Bash(*runFoundry*)",
      ],
    },
    sandbox: {
      enabled: true,
      filesystem: {
        denyRead: [`${workbenchRoot}/**`],
        allowRead: ["."],
      },
      allowUnsandboxedCommands: false,
    },
  };
}

function renderBuilderReadme(view: BuilderWorkOrderView): string {
  const criteria = view.criteria
    .map((criterion) => `- ${criterion.text}\n  - Verification: ${criterion.verification}`)
    .join("\n");
  const visibleFiles = view.visibleTestFilePaths.length
    ? view.visibleTestFilePaths.map((path) => `- \`${path}\``).join("\n")
    : "- (none apply to this slice yet — verification is scope-only)";
  const instructions = view.builderInstructions
    .map((line) => `- ${line}`)
    .join("\n");

  return [
    `# Builder work order: ${view.sliceTitle}`,
    "",
    `Work order \`${view.workOrderId}\` · slice \`${view.sliceId}\` · issued ${view.createdAt}`,
    "",
    `**Delivers:** ${view.sliceDelivers}`,
    "",
    "## Acceptance criteria",
    "",
    criteria,
    "",
    "## Interface contract",
    "",
    "```text",
    view.interfaceContract,
    "```",
    "",
    "## Applicable acceptance tests",
    "",
    visibleFiles,
    "",
    `Plus **${view.holdoutTestFileCount} withheld holdout test file(s)** the Workbench runs at submission. You never see their paths or content; implement the contract, not the tests.`,
    "",
    "## Rules",
    "",
    instructions,
    "",
    "## Working over MCP",
    "",
    "This workspace is wired to the `workbench-builder` MCP server:",
    "",
    "- `get_work_order` — this document as data",
    "- `materialize_tests` — refresh the visible acceptance tests",
    "- `submit_slice` — run Workbench verification for this workspace; attach a `report` with disclosures the operator should weigh",
    "- `get_submission` — verification results and the operator's decision",
    "- `list_open_work_orders` — what remains after this slice",
    "- `post_builder_note` — progress notes and honest disclosures, shown in the operator's console",
    "- `ask_operator` — ask when blocked; poll `get_operator_answer` for the reply",
    "",
    "Reads of the Workbench itself are denied by this workspace's settings and sandbox; the MCP tools above are your only sanctioned channel. Your words inform the operator; they never decide, and no delegation to decide can exist.",
    "",
  ].join("\n");
}

// Structural confinement check (v1.2, Decision 090 follow-through on 089):
// the scaffold is not trusted to stay intact. The builder MCP channel
// verifies the workspace's guardrails before serving, so a tampered or
// stale workspace loses its only sanctioned channel instead of operating
// unconfined. Fail-closed: unreadable files are integrity failures.
export async function verifyWorkspaceIntegrity(input: {
  projectRoot: string;
  workbenchRoot: string;
}): Promise<{ ok: boolean; problems: string[] }> {
  const projectRoot = resolve(input.projectRoot);
  const workbenchRoot = resolve(input.workbenchRoot);
  const problems: string[] = [];

  const required = builderSettings(workbenchRoot) as {
    permissions: { deny: string[] };
    sandbox: {
      enabled: boolean;
      filesystem: { denyRead: string[] };
      allowUnsandboxedCommands: boolean;
    };
  };

  let settings: typeof required | null = null;
  try {
    settings = JSON.parse(
      await readFile(join(projectRoot, ".claude", "settings.json"), "utf8"),
    ) as typeof required;
  } catch {
    problems.push(".claude/settings.json is missing or unreadable.");
  }
  if (settings) {
    const deny = new Set(settings.permissions?.deny ?? []);
    for (const entry of required.permissions.deny) {
      if (!deny.has(entry)) {
        problems.push(`Required permission deny entry is absent: ${entry}`);
      }
    }
    if (settings.sandbox?.enabled !== true) {
      problems.push("The OS sandbox is not enabled.");
    }
    const denyRead = new Set(settings.sandbox?.filesystem?.denyRead ?? []);
    for (const entry of required.sandbox.filesystem.denyRead) {
      if (!denyRead.has(entry)) {
        problems.push(`Required sandbox denyRead entry is absent: ${entry}`);
      }
    }
    if (settings.sandbox?.allowUnsandboxedCommands !== false) {
      problems.push("Unsandboxed commands are not disabled.");
    }
  }

  try {
    const mcpConfig = JSON.parse(
      await readFile(join(projectRoot, ".mcp.json"), "utf8"),
    ) as {
      mcpServers?: Record<string, { env?: Record<string, string> }>;
    };
    const pinned =
      mcpConfig.mcpServers?.["workbench-builder"]?.env?.["BUILDER_PROJECT_ROOT"];
    if (!pinned || resolve(pinned) !== projectRoot) {
      problems.push(
        ".mcp.json no longer pins BUILDER_PROJECT_ROOT to this workspace.",
      );
    }
  } catch {
    problems.push(".mcp.json is missing or unreadable.");
  }

  return { ok: problems.length === 0, problems };
}

export async function prepareBuilderWorkspace(
  deps: BuilderWorkspaceDependencies,
  input: { workOrderId: string; projectRoot: string; workbenchRoot: string },
): Promise<PreparedBuilderWorkspace> {
  const projectRoot = resolve(input.projectRoot);
  const workbenchRoot = resolve(input.workbenchRoot);

  const workOrder = await deps.workOrders.loadWorkOrder(input.workOrderId);
  const suite = await deps.testDesign.loadTestSuite(workOrder.testSuiteId);
  const view = redactWorkOrder(workOrder, suite);

  // The builder's sandbox denies git init (observed live 2026-08-09), so
  // the scaffold provides the repository the same way it provides the
  // settings: workbench-side, before the builder ever runs.
  await mkdir(projectRoot, { recursive: true });
  if (!existsSync(join(projectRoot, ".git"))) {
    const init = spawnSync("git", ["init"], {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (init.status !== 0) {
      throw new Error(
        `git init failed in ${projectRoot}: ${(init.stderr || "").trim()}`,
      );
    }
  }

  const writtenTestFiles = await deps.workOrders.materializeVisibleTests({
    workOrderId: input.workOrderId,
    projectRoot,
  });

  // .mcp.json merges: only the workbench-builder entry is owned here so the
  // generated project can register its own servers without losing them.
  const mcpPath = join(projectRoot, ".mcp.json");
  let mcpConfig: { mcpServers?: Record<string, unknown> } = {};
  try {
    mcpConfig = JSON.parse(await readFile(mcpPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
  } catch {
    // Missing or invalid: start fresh.
  }
  mcpConfig.mcpServers = {
    ...(mcpConfig.mcpServers ?? {}),
    "workbench-builder": {
      type: "stdio",
      command: "npm",
      args: ["--prefix", workbenchRoot, "run", "--silent", "mcp:builder"],
      env: { BUILDER_PROJECT_ROOT: projectRoot, BUILDER_BRIEF_ID: workOrder.briefId },
    },
  };
  await writeFile(mcpPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, "utf8");

  const settingsDirectory = join(projectRoot, ".claude");
  await mkdir(settingsDirectory, { recursive: true });
  const settingsPath = join(settingsDirectory, "settings.json");
  await writeFile(
    settingsPath,
    `${JSON.stringify(builderSettings(workbenchRoot), null, 2)}\n`,
    "utf8",
  );

  const readmePath = join(projectRoot, "BUILDER.md");
  await writeFile(readmePath, renderBuilderReadme(view), "utf8");

  return {
    projectRoot,
    writtenTestFiles,
    writtenConfigFiles: [".mcp.json", ".claude/settings.json", "BUILDER.md"],
    workOrder: view,
  };
}
