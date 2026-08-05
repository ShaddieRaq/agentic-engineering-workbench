import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import { buildWorkbenchMcpServer } from "./mcp/workbenchMcpServer.js";

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const packageJson = JSON.parse(
    await readFile(resolve(workspaceRoot, "package.json"), "utf8"),
  ) as { version?: string };

  const server = buildWorkbenchMcpServer(
    {
      agents: platformAgentRegistry,
      artifacts: new FileArtifactStore(resolve(workspaceRoot, "runs")),
      foundry: new FoundryArtifactStore(resolve(workspaceRoot, "runs/foundry")),
      exportsRoot: resolve(workspaceRoot, "exports"),
    },
    packageJson.version ?? "0.0.0",
  );

  await server.connect(new StdioServerTransport());
  console.error("Agentic Workbench MCP server connected over stdio.");
}

main().catch((error: unknown) => {
  console.error("Workbench MCP server failed:", error);
  process.exit(1);
});
