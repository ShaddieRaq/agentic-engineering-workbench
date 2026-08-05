import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createWorkbenchMcpTools,
  type WorkbenchMcpDependencies,
} from "./workbenchMcpTools.js";

const SERVER_INSTRUCTIONS =
  "Agentic Engineering Workbench evidence connection (Decision 084): read " +
  "everything, write evidence freely, never write agent policy or source. " +
  "Agent behavior changes only through the Workbench improvement loop and " +
  "source-controlled releases.";

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function buildWorkbenchMcpServer(
  deps: WorkbenchMcpDependencies,
  version: string,
): McpServer {
  const tools = createWorkbenchMcpTools(deps);
  const server = new McpServer(
    { name: "agentic-workbench", version },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "list_agents",
    {
      description:
        "Read-only. List every registered Workbench agent with id, version, " +
        "lifecycle status, and description.",
    },
    async () => asText(await tools.listAgents()),
  );

  server.registerTool(
    "describe_agent",
    {
      description:
        "Read-only. Return the full immutable manifest of a registered agent.",
      inputSchema: { agentId: z.string().min(1) },
    },
    async (input) => asText(await tools.describeAgent(input)),
  );

  server.registerTool(
    "list_artifacts",
    {
      description:
        "Read-only. List evidence artifact summaries from the shared runs " +
        "store (agent runs, evaluations, proposals, decisions) or the foundry " +
        "store (project briefs, brief decisions, intake turns, export feedback).",
      inputSchema: {
        source: z.enum(["runs", "foundry"]),
        kind: z.string().min(1).optional(),
        agentId: z.string().min(1).optional(),
        briefId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async (input) => asText(await tools.listArtifacts(input)),
  );

  server.registerTool(
    "get_artifact",
    {
      description:
        "Read-only. Load one complete evidence artifact by id from the runs " +
        "or foundry store.",
      inputSchema: {
        source: z.enum(["runs", "foundry"]),
        artifactId: z.string().min(1),
      },
    },
    async (input) => asText(await tools.getArtifact(input)),
  );

  server.registerTool(
    "submit_feedback",
    {
      description:
        "Writes evidence. Import an exported agent's feedback bundle: the " +
        "bundle's export identity and policy digest are verified against the " +
        "export package's provenance before an immutable export-feedback " +
        "evidence record is persisted. Never modifies agent policy.",
      inputSchema: {
        bundleJson: z.string().min(2),
        exportDirectory: z.string().min(1).optional(),
      },
    },
    async (input) => asText(await tools.submitFeedback(input)),
  );

  server.registerTool(
    "get_approved_export",
    {
      description:
        "Read-only delivery. Return the complete approved export package for " +
        "an agent (all files with contents) so the session can install it " +
        "locally. Only evidence-approved, digest-verified packages are served.",
      inputSchema: {
        agentId: z.string().min(1),
        target: z.enum(["claude-code"]),
      },
    },
    async (input) => asText(await tools.getApprovedExport(input)),
  );

  return server;
}
