import { z } from "zod";
import {
  defineAgent,
  type AgentRegistration,
} from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import { citationGroundingSchema } from "../shared/evidenceCitation.js";
import {
  droppedAdvocatePointSchema,
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
    proposedGrade: z.number().int().min(0).max(100).nullable(),
    // only points with at least one validated fact ref; each carries its refs
    points: z.array(resolvedAdvocatePointSchema),
    // points whose every ref was out of range — diagnostic, not part of the argument
    droppedPoints: z.array(droppedAdvocatePointSchema),
    // parsed, but nothing cited: evidentially UNMADE (succeeded stays true)
    allUnsupported: z.boolean(),
    groundingEvaluation: citationGroundingSchema.nullable(),
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
        proposedGrade: result.parsedOutput?.proposedGrade ?? null,
        points: result.resolvedPoints,
        droppedPoints: result.droppedPoints,
        allUnsupported: result.allUnsupported,
        groundingEvaluation: result.groundingEvaluation,
        strongestOpposingPoint:
          result.parsedOutput?.strongestOpposingPoint ?? null,
        summary: result.parsedOutput?.summary ?? null,
        advocateEvidence: result as unknown as z.infer<
          ReturnType<typeof z.json>
        >,
      };
    },
    assess(output) {
      // The eval bar is a USEFUL argument: an all-unsupported one is an
      // operational success but an evidential failure, and the eval loop
      // should push the policy away from it.
      const passed = output.succeeded && !output.allUnsupported;
      return {
        passed,
        message: !output.succeeded
          ? "Advocate did not produce an argument (provider, refusal or schema failure)."
          : output.allUnsupported
            ? "Advocate produced an argument but no point cites a supplied fact (evidentially unmade)."
            : "Advocate produced a fact-cited argument.",
      };
    },
  });
}

export const councilAdvocateAgent = createCouncilAdvocateAgent();
