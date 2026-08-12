import { z } from "zod";
import { architecturePlanSchema } from "../../foundry/architecturePlan.js";
import {
  capabilityCatalogSchema,
  capabilityPlanContentShapeSchema,
  capabilityPlanOutputSchema,
} from "../../foundry/capabilityPlan.js";
import { reconcileCapabilityPlanContent } from "../../foundry/capabilityReconciliation.js";
import { revisionContextSchema } from "../../foundry/revisionContext.js";
import { defineAgent, type AgentRegistration } from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import {
  capabilityPlannerBaselinePolicy,
  capabilityPlannerPolicySchema,
  type CapabilityPlannerPolicy,
} from "./capabilityPlannerPolicy.js";
import { buildCapabilityPlannerPrompt } from "./capabilityPlannerPrompt.js";
import { assessCapabilityPlannerExpectation } from "./capabilityPlannerExpectation.js";

export const capabilityPlannerInputSchema = z
  .object({
    plan: architecturePlanSchema,
    catalog: capabilityCatalogSchema,
    revision: revisionContextSchema.optional(),
  })
  .strict();

export function createCapabilityPlannerAgent(
  policy: CapabilityPlannerPolicy = capabilityPlannerBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = capabilityPlannerPolicySchema.parse(policy);

  return defineAgent({
    manifest: {
      id: "capability-planner",
      name: "Capability Planner",
      version: "0.1.0",
      status: "experimental",
      description:
        "Maps an approved architecture plan onto existing agents, tools, " +
        "project code, and proposed missing capabilities with deterministic " +
        "coverage validation.",
      owner: "local-platform",
      tags: ["foundry", "capabilities"],
      defaultModel: "gpt-5.4-mini",
      components: {
        workflowIds: [],
        harnessIds: [],
        scenarioIds: [],
        datasetIds: [],
      },
      permissions: { toolIds: [] },
      verification: {
        datasetIds: ["capability-planner-smoke"],
        minimumPassRate: null,
      },
    },
    inputSchema: capabilityPlannerInputSchema,
    outputSchema: capabilityPlanOutputSchema,
    revisionSurface: defineAgentRevisionSurface<CapabilityPlannerPolicy>({
      schema: capabilityPlannerPolicySchema,
      baselinePolicy: capabilityPlannerBaselinePolicy,
      mutableFields: ["instructions"],
      createCandidate: createCapabilityPlannerAgent,
    }),
    async execute(input, services) {
      const result = await services.provider.generate({
        prompt: buildCapabilityPlannerPrompt(
          input.plan,
          input.catalog,
          effectivePolicy,
          input.revision,
        ),
        outputSchema: capabilityPlanContentShapeSchema,
      });

      if (result.refusal !== null) {
        throw new Error(`Provider refused the capability plan: ${result.refusal}`);
      }
      if (result.parsedOutput === null) {
        throw new Error(
          `Provider returned no parsable capability plan: ${result.rawOutput}`,
        );
      }

      return reconcileCapabilityPlanContent(
        capabilityPlanContentShapeSchema.parse(result.parsedOutput),
        input.plan,
        input.catalog,
      );
    },
    assessDatasetCase(_input, output, expected) {
      return assessCapabilityPlannerExpectation(output, expected);
    },
    assess(output) {
      if (output.needs.length === 0) {
        return {
          passed: false,
          message: "Capability plan contains no needs.",
        };
      }
      const blockingConcerns = output.concerns.filter(
        ({ severity }) => severity === "blocking",
      ).length;
      return {
        passed: true,
        message:
          `Plan produced ${output.needs.length} need(s), ` +
          `${output.proposedCapabilities.length} proposal(s), and ` +
          `${blockingConcerns} blocking concern(s).`,
      };
    },
  });
}

export const capabilityPlannerAgent = createCapabilityPlannerAgent();
