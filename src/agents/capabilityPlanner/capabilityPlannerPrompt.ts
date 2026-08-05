import type { ArchitecturePlan } from "../../foundry/architecturePlan.js";
import type { CapabilityCatalog } from "../../foundry/capabilityPlan.js";
import {
  renderRevisionSection,
  type RevisionContext,
} from "../../foundry/revisionContext.js";
import {
  capabilityPlannerBaselinePolicy,
  type CapabilityPlannerPolicy,
} from "./capabilityPlannerPolicy.js";

export function buildCapabilityPlannerPrompt(
  plan: ArchitecturePlan,
  catalog: CapabilityCatalog,
  policy: CapabilityPlannerPolicy = capabilityPlannerBaselinePolicy,
  revision?: RevisionContext | undefined,
): string {
  const { instructions } = policy;

  return [
    "ROLE:",
    ...instructions.roleLines,
    "",
    "MAPPING RULES:",
    ...instructions.mappingRules.map((rule) => `- ${rule}`),
    "",
    "COVERAGE RULES:",
    ...instructions.coverageRules.map((rule) => `- ${rule}`),
    "",
    "AVAILABLE CAPABILITY CATALOG:",
    JSON.stringify(catalog, null, 2),
    "",
    "APPROVED ARCHITECTURE PLAN:",
    JSON.stringify(plan, null, 2),
    ...(revision ? renderRevisionSection(revision) : []),
    "",
    "TASK:",
    ...instructions.taskLines,
  ].join("\n");
}
