import { z } from "zod";
import type {
  BrandCollisionInput,
  BrandCollisionOutput,
} from "../../tools/brandCollisionTool.js";
import {
  defineAgent,
  type AgentRegistration,
} from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import {
  impersonationJudgmentSchema,
  resolvedImpersonationRiskFlagSchema,
  runImpersonationAnalysis,
} from "./impersonationAnalyst.js";
import {
  impersonationAnalystBaselinePolicy,
  impersonationAnalystPolicySchema,
  type ImpersonationAnalystPolicy,
} from "./impersonationAnalystPolicy.js";

function createImpersonationAnalystInputSchema(
  policy: ImpersonationAnalystPolicy,
) {
  return z
    .object({
      symbol: z.string().min(1).max(120).optional(),
      name: z.string().min(1).max(200).optional(),
      chain: z.string().min(1).max(40).optional(),
      token: z.string().min(1).max(120).optional(),
      instruction: z
        .string()
        .min(1)
        .max(2_000)
        .default(policy.instructions.defaultTaskInstruction),
    })
    .strict()
    .refine((value) => Boolean(value.symbol || value.name), {
      message: "Provide at least one of symbol or name.",
    });
}

export const impersonationAnalystInputSchema =
  createImpersonationAnalystInputSchema(impersonationAnalystBaselinePolicy);

export const impersonationAnalystOutputSchema = z
  .object({
    analysisRunId: z.string().min(1),
    succeeded: z.boolean(),
    impersonationRisk:
      impersonationJudgmentSchema.shape.impersonationRisk.nullable(),
    riskFlags: z.array(resolvedImpersonationRiskFlagSchema),
    confidence: impersonationJudgmentSchema.shape.confidence.nullable(),
    rationale: z.string().nullable(),
    analysisEvidence: z.json(),
  })
  .strict();

export function createImpersonationAnalystAgent(
  policy: ImpersonationAnalystPolicy = impersonationAnalystBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = impersonationAnalystPolicySchema.parse(policy);
  return defineAgent({
    manifest: {
      id: "impersonation-analyst",
      name: "Impersonation Analyst",
      version: "0.1.0",
      status: "experimental",
      description:
        "Judges whether a token's name/symbol deceptively reuses an existing identity (impersonation / brand-swarm), citing colliding contracts.",
      owner: "local-platform",
      tags: ["crypto", "social", "impersonation", "risk-linter"],
      defaultModel: "gpt-5.4",
      reasoningTier: "advanced",
      components: {
        workflowIds: [],
        harnessIds: [],
        scenarioIds: [],
        datasetIds: [],
      },
      permissions: { toolIds: ["brand-collision"] },
      verification: {
        datasetIds: [
          "impersonation-analyst-smoke",
          "impersonation-analyst-protected",
        ],
        minimumPassRate: 1,
      },
    },
    inputSchema: createImpersonationAnalystInputSchema(effectivePolicy),
    outputSchema: impersonationAnalystOutputSchema,
    revisionSurface: defineAgentRevisionSurface<ImpersonationAnalystPolicy>({
      schema: impersonationAnalystPolicySchema,
      baselinePolicy: impersonationAnalystBaselinePolicy,
      mutableFields: ["instructions", "rubric"],
      createCandidate: createImpersonationAnalystAgent,
    }),
    async execute(input, services) {
      const tool = services.tools.get<
        BrandCollisionInput,
        BrandCollisionOutput
      >("brand-collision");
      const result = await runImpersonationAnalysis(
        tool,
        services.provider,
        {
          symbol: input.symbol,
          name: input.name,
          chain: input.chain,
          token: input.token,
          instruction: input.instruction,
        },
        effectivePolicy,
      );
      return {
        analysisRunId: result.analysisRunId,
        succeeded: result.succeeded,
        impersonationRisk: result.parsedOutput?.impersonationRisk ?? null,
        riskFlags: result.resolvedRiskFlags,
        confidence: result.parsedOutput?.confidence ?? null,
        rationale: result.parsedOutput?.rationale ?? null,
        analysisEvidence: result as unknown as z.infer<
          ReturnType<typeof z.json>
        >,
      };
    },
    assess(output) {
      return {
        passed: output.succeeded,
        message: output.succeeded
          ? "Impersonation analysis produced a grounded, evidence-cited judgment."
          : "Impersonation analysis did not produce a grounded successful judgment.",
      };
    },
  });
}

export const impersonationAnalystAgent = createImpersonationAnalystAgent();
