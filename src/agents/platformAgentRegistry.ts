import { AgentRegistry } from "./agentRegistry.js";
import { repositoryAssistantAgent } from "./repositoryAssistant/repositoryAssistantAgent.js";
import { changeRiskReviewerAgent } from "./changeRiskReviewer/changeRiskReviewerAgent.js";
import { documentationAuditorAgent } from "./documentationAuditor/documentationAuditorAgent.js";
import { toolBuilderAgent } from "./toolBuilder/toolBuilderAgent.js";
import { playwrightFailureTriageAgent } from "./playwrightFailureTriage/playwrightFailureTriageAgent.js";
import { agentImprovementAnalystAgent } from "./agentImprovement/agentImprovementAnalystAgent.js";
import { capabilityPlannerAgent } from "./capabilityPlanner/capabilityPlannerAgent.js";
import { projectArchitectAgent } from "./projectArchitect/projectArchitectAgent.js";
import { projectIntakeAgent } from "./projectIntake/projectIntakeAgent.js";
import { testDesignerAgent } from "./testDesigner/testDesignerAgent.js";

export const platformAgentRegistry = new AgentRegistry([
  agentImprovementAnalystAgent,
  capabilityPlannerAgent,
  changeRiskReviewerAgent,
  documentationAuditorAgent,
  playwrightFailureTriageAgent,
  projectArchitectAgent,
  projectIntakeAgent,
  repositoryAssistantAgent,
  testDesignerAgent,
  toolBuilderAgent,
]);
