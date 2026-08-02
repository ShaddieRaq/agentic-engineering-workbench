import { listScenarioDatasetDefinitions } from "../datasets/scenarioDatasetRegistry.js";
import { listHarnessDefinitions } from "../harnesses/harnessRegistry.js";
import { listScenarioDefinitions } from "../scenarios/scenarioRegistry.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import { listWorkflowDescriptors } from "../workflows/workflowRegistry.js";
import type { AgentRegistry } from "./agentRegistry.js";
import { listAgentDatasetDefinitions } from "./datasets/agentDatasetRegistry.js";

export type AgentComponentType =
  | "workflow"
  | "harness"
  | "scenario"
  | "dataset"
  | "agent-dataset"
  | "tool";

export interface AgentCatalogValidationIssue {
  agentId: string;
  componentType: AgentComponentType;
  referencedId: string;
  message: string;
}

function missingReferences(
  agentId: string,
  componentType: AgentComponentType,
  references: readonly string[],
  available: ReadonlySet<string>,
): AgentCatalogValidationIssue[] {
  return references
    .filter((id) => !available.has(id))
    .map((referencedId) => ({
      agentId,
      componentType,
      referencedId,
      message: `Agent ${agentId} references unknown ${componentType} ${referencedId}.`,
    }));
}

export function validateAgentCatalog(
  agents: AgentRegistry,
  tools: ToolRegistry,
): AgentCatalogValidationIssue[] {
  const workflowIds = new Set(listWorkflowDescriptors().map(({ id }) => id));
  const harnessIds = new Set(listHarnessDefinitions().map(({ id }) => id));
  const scenarioIds = new Set(listScenarioDefinitions().map(({ id }) => id));
  const datasetIds = new Set(
    listScenarioDatasetDefinitions().map(({ id }) => id),
  );
  const agentDatasetIds = new Set(
    listAgentDatasetDefinitions().map(({ id }) => id),
  );
  const toolIds = new Set(tools.ids());

  return agents.list().flatMap((manifest) => [
    ...missingReferences(
      manifest.id,
      "workflow",
      manifest.components.workflowIds,
      workflowIds,
    ),
    ...missingReferences(
      manifest.id,
      "harness",
      manifest.components.harnessIds,
      harnessIds,
    ),
    ...missingReferences(
      manifest.id,
      "scenario",
      manifest.components.scenarioIds,
      scenarioIds,
    ),
    ...missingReferences(
      manifest.id,
      "dataset",
      manifest.components.datasetIds,
      datasetIds,
    ),
    ...missingReferences(
      manifest.id,
      "agent-dataset",
      manifest.verification.datasetIds,
      agentDatasetIds,
    ),
    ...missingReferences(
      manifest.id,
      "tool",
      manifest.permissions.toolIds,
      toolIds,
    ),
  ]);
}

export function assertAgentCatalogValid(
  agents: AgentRegistry,
  tools: ToolRegistry,
): void {
  const issues = validateAgentCatalog(agents, tools);

  if (issues.length > 0) {
    throw new Error(
      `Agent catalog validation failed:\n${issues.map(({ message }) => `- ${message}`).join("\n")}`,
    );
  }
}
