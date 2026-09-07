import { z } from "zod";
import {
  defineAgent,
  type AgentRegistration,
} from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import { judgeRulingSchema, runCouncilJudge } from "./councilJudge.js";
import {
  councilJudgeBaselinePolicy,
  councilJudgePolicySchema,
  type CouncilJudgePolicy,
} from "./councilJudgePolicy.js";

function createCouncilJudgeInputSchema(policy: CouncilJudgePolicy) {
  return z
    .object({
      facts: z.array(z.string().min(1).max(600)).min(1).max(60),
      forArgument: z.string().min(1).max(8_000),
      againstArgument: z.string().min(1).max(8_000),
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

export const councilJudgeInputSchema = createCouncilJudgeInputSchema(
  councilJudgeBaselinePolicy,
);

export const councilJudgeOutputSchema = z
  .object({
    judgeRunId: z.string().min(1),
    succeeded: z.boolean(),
    grade: judgeRulingSchema.shape.grade.nullable(),
    gradeConfidence: judgeRulingSchema.shape.gradeConfidence.nullable(),
    decidingFacts: z.array(z.string().min(1)),
    rationale: z.string().nullable(),
    judgeEvidence: z.json(),
  })
  .strict();

export function createCouncilJudgeAgent(
  policy: CouncilJudgePolicy = councilJudgeBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = councilJudgePolicySchema.parse(policy);
  return defineAgent({
    manifest: {
      id: "council-judge",
      name: "Council Judge",
      version: "0.1.0",
      status: "experimental",
      description:
        "Rules act or skip on a token by weighing the for/against advocate arguments against the case facts.",
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
        datasetIds: ["council-judge-smoke", "council-judge-protected"],
        minimumPassRate: 1,
      },
    },
    inputSchema: createCouncilJudgeInputSchema(effectivePolicy),
    outputSchema: councilJudgeOutputSchema,
    revisionSurface: defineAgentRevisionSurface<CouncilJudgePolicy>({
      schema: councilJudgePolicySchema,
      baselinePolicy: councilJudgeBaselinePolicy,
      mutableFields: ["instructions"],
      createCandidate: createCouncilJudgeAgent,
    }),
    async execute(input, services) {
      const result = await runCouncilJudge(
        services.provider,
        {
          facts: input.facts,
          forArgument: input.forArgument,
          againstArgument: input.againstArgument,
          token: input.token,
          chain: input.chain,
          instruction: input.instruction,
        },
        effectivePolicy,
      );
      return {
        judgeRunId: result.judgeRunId,
        succeeded: result.succeeded,
        grade: result.parsedOutput?.grade ?? null,
        gradeConfidence: result.parsedOutput?.gradeConfidence ?? null,
        decidingFacts: result.decidingFacts,
        rationale: result.parsedOutput?.rationale ?? null,
        judgeEvidence: result as unknown as z.infer<
          ReturnType<typeof z.json>
        >,
      };
    },
    assess(output) {
      return {
        passed: output.succeeded,
        message: output.succeeded
          ? "Judge produced a grounded ruling."
          : "Judge did not produce a grounded successful ruling.",
      };
    },
  });
}

export const councilJudgeAgent = createCouncilJudgeAgent();
