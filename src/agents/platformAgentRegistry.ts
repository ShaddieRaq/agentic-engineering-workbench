import { AgentRegistry } from "./agentRegistry.js";
import { repositoryAssistantAgent } from "./repositoryAssistant/repositoryAssistantAgent.js";
import { changeRiskReviewerAgent } from "./changeRiskReviewer/changeRiskReviewerAgent.js";
import { documentationAuditorAgent } from "./documentationAuditor/documentationAuditorAgent.js";
import { toolBuilderAgent } from "./toolBuilder/toolBuilderAgent.js";
import { playwrightFailureTriageAgent } from "./playwrightFailureTriage/playwrightFailureTriageAgent.js";

export const platformAgentRegistry = new AgentRegistry([
  changeRiskReviewerAgent,
  documentationAuditorAgent,
  playwrightFailureTriageAgent,
  repositoryAssistantAgent,
  toolBuilderAgent,
]);
