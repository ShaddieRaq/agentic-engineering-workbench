import { AgentRegistry } from "./agentRegistry.js";
import { repositoryAssistantAgent } from "./repositoryAssistant/repositoryAssistantAgent.js";
import { changeRiskReviewerAgent } from "./changeRiskReviewer/changeRiskReviewerAgent.js";

export const platformAgentRegistry = new AgentRegistry([
  changeRiskReviewerAgent,
  repositoryAssistantAgent,
]);
