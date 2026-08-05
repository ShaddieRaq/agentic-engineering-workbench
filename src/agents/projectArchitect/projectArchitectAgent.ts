import { z } from "zod";
import {
  architecturePlanContentShapeSchema,
  architectPlanOutputSchema,
} from "../../foundry/architecturePlan.js";
import { reconcileArchitecturePlanContent } from "../../foundry/architectureReconciliation.js";
import { projectBriefSchema } from "../../foundry/projectBrief.js";
import { defineAgent, type AgentRegistration } from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import { assessProjectArchitectExpectation } from "./projectArchitectExpectation.js";
import {
  projectArchitectBaselinePolicy,
  projectArchitectPolicySchema,
  type ProjectArchitectPolicy,
} from "./projectArchitectPolicy.js";
import { buildProjectArchitectPrompt } from "./projectArchitectPrompt.js";

export const projectArchitectInputSchema = z
  .object({ brief: projectBriefSchema })
  .strict();

export function createProjectArchitectAgent(
  policy: ProjectArchitectPolicy = projectArchitectBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = projectArchitectPolicySchema.parse(policy);

  return defineAgent({
    manifest: {
      id: "project-architect",
      name: "Project Architect",
      version: "0.1.0",
      status: "experimental",
      description:
        "Turns an approved project brief into an architecture and acceptance " +
        "plan with deterministic coverage validation.",
      owner: "local-platform",
      tags: ["foundry", "architecture"],
      defaultModel: "gpt-5.4-mini",
      components: {
        workflowIds: [],
        harnessIds: [],
        scenarioIds: [],
        datasetIds: [],
      },
      permissions: { toolIds: [] },
      verification: {
        datasetIds: ["project-architect-smoke"],
        minimumPassRate: 1,
      },
    },
    inputSchema: projectArchitectInputSchema,
    outputSchema: architectPlanOutputSchema,
    revisionSurface: defineAgentRevisionSurface<ProjectArchitectPolicy>({
      schema: projectArchitectPolicySchema,
      baselinePolicy: projectArchitectBaselinePolicy,
      mutableFields: ["instructions"],
      createCandidate: createProjectArchitectAgent,
    }),
    async execute(input, services) {
      const result = await services.provider.generate({
        prompt: buildProjectArchitectPrompt(input.brief, effectivePolicy),
        outputSchema: architecturePlanContentShapeSchema,
      });

      if (result.refusal !== null) {
        throw new Error(`Provider refused the architecture plan: ${result.refusal}`);
      }
      if (result.parsedOutput === null) {
        throw new Error(
          `Provider returned no parsable architecture plan: ${result.rawOutput}`,
        );
      }

      return reconcileArchitecturePlanContent(
        architecturePlanContentShapeSchema.parse(result.parsedOutput),
        input.brief,
      );
    },
    assess(output) {
      if (output.acceptancePlan.length === 0) {
        return {
          passed: false,
          message: "Architecture plan contains no acceptance mappings.",
        };
      }
      const blockingConcerns = output.concerns.filter(
        ({ severity }) => severity === "blocking",
      ).length;
      return {
        passed: true,
        message:
          `Plan produced ${output.components.length} component(s), ` +
          `${output.implementationSlices.length} slice(s), ` +
          `${output.acceptancePlan.length} acceptance mapping(s), and ` +
          `${blockingConcerns} blocking concern(s).`,
      };
    },
    assessDatasetCase(_input, output, expected) {
      return assessProjectArchitectExpectation(output, expected);
    },
  });
}

export const projectArchitectAgent = createProjectArchitectAgent();
