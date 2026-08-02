import { AgentRegistry } from "./agentRegistry.js";
import { repositoryAssistantAgent } from "./repositoryAssistant/repositoryAssistantAgent.js";

export const platformAgentRegistry = new AgentRegistry([
  repositoryAssistantAgent,
]);
