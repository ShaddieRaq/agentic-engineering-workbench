import { z } from "zod";
import {
  defineAgent,
  type AgentRegistration,
} from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import {
  resolvedAdvocatePointSchema,
  runCouncilAdvocate,
} from "./councilAdvocate.js";
import {
  councilAdvocateBaselinePolicy,
  councilAdvocatePolicySchema,
  type CouncilAdvocatePolicy,
} from "./councilAdvocatePolicy.js";

function createCouncilAdvocateInputSchema(policy: CouncilAdvocatePolicy) {
  return z
    .object({
      stance: z.enum(["for", "against"]),
      facts: z.array(z.string().min(1).max(600)).min(1).max(60),
      token: z.string().min(1).max(120).optional(),
      chain: z.string().min(1).max(40).optional(),
      instruction: z
        .string()
        .min(1)
        .max(2_000)
        .default(policy.instructions.defaultTaskInstruction),
    })
    .strict();
}

export const councilAdvocateInputSchema =
  createCouncilAdvocateInputSchema(councilAdvocateBaselinePolicy);

export const councilAdvocateOutputSchema = z
  .object({
    advocateRunId: z.string().min(1),
    succeeded: z.boolean(),
    stance: z.enum(["for", "against"]),
    points: z.array(resolvedAdvocatePointSchema),
    strongestOpposingPoint: z.string().nullable(),
    summary: z.string().nullable(),
    advocateEvidence: z.json(),
  })
  .strict();

export function createCouncilAdvocateAgent(
  policy: CouncilAdvocatePolicy = councilAdvocateBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = councilAdvocatePolicySchema.parse(policy);
  return defineAgent({
    manifest: {
      id: "council-advocate",
      name: "Council Advocate",
      version: "0.1.0",
      status: "experimental",
      description:
        "Argues one assigned side (for/against taking a position) before the council judge, citing case facts by number.",
      owner: "local-platform",
      tags: ["crypto", "council", "decision", "risk-linter"],
      defaultModel: "gpt-5.4",
      reasoningTier: "advanced",
      components: {
        workflowIds: [],
        harnessIds: [],
        scenarioIds: [],
        datasetIds: [],
      },
      permissions: { toolIds: [] },
      verification: {
        datasetIds: [
          "council-advocate-smoke",
          "council-advocate-protected",
        ],
        minimumPassRate: 1,
      },
    },
    inputSchema: createCouncilAdvocateInputSchema(effectivePolicy),
    outputSchema: councilAdvocateOutputSchema,
    revisionSurface: defineAgentRevisionSurface<CouncilAdvocatePolicy>({
      schema: councilAdvocatePolicySchema,
      baselinePolicy: councilAdvocateBaselinePolicy,
      mutableFields: ["instructions"],
      createCandidate: createCouncilAdvocateAgent,
    }),
    async execute(input, services) {
      const result = await runCouncilAdvocate(
        services.provider,
        {
          stance: input.stance,
          facts: input.facts,
          token: input.token,
          chain: input.chain,
          instruction: input.instruction,
        },
        effectivePolicy,
      );
      return {
        advocateRunId: result.advocateRunId,
        succeeded: result.succeeded,
        stance: result.stance,
        points: result.resolvedPoints,
        strongestOpposingPoint:
          result.parsedOutput?.strongestOpposingPoint ?? null,
        summary: result.parsedOutput?.summary ?? null,
        advocateEvidence: result as unknown as z.infer<
          ReturnType<typeof z.json>
        >,
      };
    },
    assess(output) {
      return {
        passed: output.succeeded,
        message: output.succeeded
          ? "Advocate produced a grounded, fact-cited argument."
          : "Advocate did not produce a grounded successful argument.",
      };
    },
  });
}

export const councilAdvocateAgent = createCouncilAdvocateAgent();
