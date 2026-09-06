import { AgentRegistry } from "./agentRegistry.js";
import { repositoryAssistantAgent } from "./repositoryAssistant/repositoryAssistantAgent.js";
import { changeRiskReviewerAgent } from "./changeRiskReviewer/changeRiskReviewerAgent.js";
import { councilAdvocateAgent } from "./councilAdvocate/councilAdvocateAgent.js";
import { councilJudgeAgent } from "./councilJudge/councilJudgeAgent.js";
import { deployerForensicsAgent } from "./deployerForensics/deployerForensicsAgent.js";
import { documentationAuditorAgent } from "./documentationAuditor/documentationAuditorAgent.js";
import { impersonationAnalystAgent } from "./impersonationAnalyst/impersonationAnalystAgent.js";
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
  councilAdvocateAgent,
  councilJudgeAgent,
  deployerForensicsAgent,
  documentationAuditorAgent,
  impersonationAnalystAgent,
  playwrightFailureTriageAgent,
  projectArchitectAgent,
  projectIntakeAgent,
  repositoryAssistantAgent,
  testDesignerAgent,
  toolBuilderAgent,
]);
