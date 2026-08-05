import type { AgentDatasetDefinition } from "./agentDatasetDefinition.js";
import { repositoryAssistantDataset } from "./repositoryAssistantDataset.js";
import { changeRiskReviewerDataset } from "./changeRiskReviewerDataset.js";
import { documentationAuditorDataset } from "./documentationAuditorDataset.js";
import {
  documentationAuditorProtectedDataset,
} from "./documentationAuditorProtectedDataset.js";
import { toolBuilderDataset } from "./toolBuilderDataset.js";
import { playwrightFailureTriageDataset } from "./playwrightFailureTriageDataset.js";
import { agentImprovementAnalystDataset } from "./agentImprovementAnalystDataset.js";
import { projectArchitectDataset } from "./projectArchitectDataset.js";
import { projectIntakeDataset } from "./projectIntakeDataset.js";

const datasets: Record<string, AgentDatasetDefinition> = {
  [agentImprovementAnalystDataset.id]: agentImprovementAnalystDataset,
  [projectArchitectDataset.id]: projectArchitectDataset,
  [projectIntakeDataset.id]: projectIntakeDataset,
  [changeRiskReviewerDataset.id]: changeRiskReviewerDataset,
  [documentationAuditorDataset.id]: documentationAuditorDataset,
  [documentationAuditorProtectedDataset.id]:
    documentationAuditorProtectedDataset,
  [repositoryAssistantDataset.id]: repositoryAssistantDataset,
  [toolBuilderDataset.id]: toolBuilderDataset,
  [playwrightFailureTriageDataset.id]: playwrightFailureTriageDataset,
};

export function getAgentDatasetDefinition(id: string): AgentDatasetDefinition {
  const dataset = datasets[id];

  if (!dataset) {
    throw new Error(`Unknown agent dataset: ${id}`);
  }

  return dataset;
}

export function listAgentDatasetDefinitions(): AgentDatasetDefinition[] {
  return Object.values(datasets).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}
