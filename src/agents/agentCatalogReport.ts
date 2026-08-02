import { randomUUID } from "node:crypto";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import { validateAgentCatalog } from "./agentCatalogValidator.js";
import type { AgentManifest } from "./agentManifest.js";
import type { AgentRegistry } from "./agentRegistry.js";

export interface AgentCatalogReport {
  catalogReportId: string;
  totalAgents: number;
  statusCounts: Record<AgentManifest["status"], number>;
  agents: AgentManifest[];
  validationIssues: ReturnType<typeof validateAgentCatalog>;
  valid: boolean;
  generatedAt: string;
}

export function buildAgentCatalogReport(
  agents: AgentRegistry,
  tools: ToolRegistry,
): AgentCatalogReport {
  const manifests = agents.list();
  const validationIssues = validateAgentCatalog(agents, tools);
  const statusCounts = {
    experimental: 0,
    active: 0,
    deprecated: 0,
    retired: 0,
  };

  for (const manifest of manifests) {
    statusCounts[manifest.status] += 1;
  }

  return {
    catalogReportId: randomUUID(),
    totalAgents: manifests.length,
    statusCounts,
    agents: manifests,
    validationIssues,
    valid: validationIssues.length === 0,
    generatedAt: new Date().toISOString(),
  };
}
