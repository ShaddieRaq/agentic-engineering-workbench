import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { buildWorkbenchMcpServer } from "../src/mcp/workbenchMcpServer.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

describe("workbench MCP server", () => {
  it("serves tools over the protocol with tier descriptions", async () => {
    const runsDirectory = await mkdtemp(join(tmpdir(), "mcp-server-runs-"));
    const foundryDirectory = await mkdtemp(join(tmpdir(), "mcp-server-foundry-"));
    createdDirectories.push(runsDirectory, foundryDirectory);

    const server = buildWorkbenchMcpServer(
      {
        agents: platformAgentRegistry,
        artifacts: new FileArtifactStore(runsDirectory),
        foundry: new FoundryArtifactStore(foundryDirectory),
        exportsRoot: runsDirectory,
      },
      "0.0.0-test",
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const listed = await client.listTools();
    const names = listed.tools.map(({ name }) => name).sort();
    expect(names).toEqual([
      "describe_agent",
      "get_approved_export",
      "get_artifact",
      "list_agents",
      "list_artifacts",
      "submit_feedback",
    ]);

    const submit = listed.tools.find(({ name }) => name === "submit_feedback");
    expect(submit?.description).toMatch(/writes evidence/i);
    expect(submit?.description).toMatch(/never modifies agent policy/i);

    const result = await client.callTool({ name: "list_agents", arguments: {} });
    const content = result.content as { type: string; text: string }[];
    const agents = JSON.parse(content[0]!.text) as { id: string }[];
    expect(agents.map(({ id }) => id)).toContain("project-intake");

    await client.close();
    await server.close();
  });
});
