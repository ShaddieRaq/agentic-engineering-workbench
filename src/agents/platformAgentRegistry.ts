import { AgentRegistry } from "./agentRegistry.js";
import { repositoryAssistantAgent } from "./repositoryAssistant/repositoryAssistantAgent.js";
import { changeRiskReviewerAgent } from "./changeRiskReviewer/changeRiskReviewerAgent.js";
import { documentationAuditorAgent } from "./documentationAuditor/documentationAuditorAgent.js";
import { toolBuilderAgent } from "./toolBuilder/toolBuilderAgent.js";
import { playwrightFailureTriageAgent } from "./playwrightFailureTriage/playwrightFailureTriageAgent.js";
import { agentImprovementAnalystAgent } from "./agentImprovement/agentImprovementAnalystAgent.js";

export const platformAgentRegistry = new AgentRegistry([
  agentImprovementAnalystAgent,
  changeRiskReviewerAgent,
  documentationAuditorAgent,
  playwrightFailureTriageAgent,
  repositoryAssistantAgent,
  toolBuilderAgent,
]);
