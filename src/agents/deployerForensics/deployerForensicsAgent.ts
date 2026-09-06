import { z } from "zod";
import type {
  DeployerHistoryInput,
  DeployerHistoryOutput,
} from "../../tools/deployerHistoryTool.js";
import {
  defineAgent,
  type AgentRegistration,
} from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import {
  deployerForensicsJudgmentSchema,
  deployerRiskFlagSchema,
  runDeployerForensics,
} from "./deployerForensics.js";
import {
  deployerForensicsBaselinePolicy,
  deployerForensicsPolicySchema,
  type DeployerForensicsPolicy,
} from "./deployerForensicsPolicy.js";

function createDeployerForensicsInputSchema(policy: DeployerForensicsPolicy) {
  return z
    .object({
      deployer: z.string().min(1).max(120),
      chain: z.string().min(1).max(40).optional(),
      token: z.string().min(1).max(120).optional(),
      instruction: z
        .string()
        .min(1)
        .max(2_000)
        .default(policy.instructions.defaultTaskInstruction),
    })
    .strict();
}

export const deployerForensicsInputSchema =
  createDeployerForensicsInputSchema(deployerForensicsBaselinePolicy);

export const deployerForensicsOutputSchema = z
  .object({
    forensicsRunId: z.string().min(1),
    succeeded: z.boolean(),
    actorReputation:
      deployerForensicsJudgmentSchema.shape.actorReputation.nullable(),
    riskFlags: z.array(deployerRiskFlagSchema),
    priorTokenCount: z.number().int().nonnegative(),
    confidence: deployerForensicsJudgmentSchema.shape.confidence.nullable(),
    rationale: z.string().nullable(),
    forensicsEvidence: z.json(),
  })
  .strict();

export function createDeployerForensicsAgent(
  policy: DeployerForensicsPolicy = deployerForensicsBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = deployerForensicsPolicySchema.parse(policy);
  return defineAgent({
    manifest: {
      id: "deployer-forensics",
      name: "Deployer Forensics",
      version: "0.1.0",
      status: "experimental",
      description:
        "Judges a token deployer's track record from its prior-launch dossier, citing prior tokens as evidence.",
      owner: "local-platform",
      tags: ["crypto", "forensics", "actor-reputation", "risk-linter"],
      defaultModel: "gpt-5.4",
      reasoningTier: "advanced",
      components: {
        workflowIds: [],
        harnessIds: [],
        scenarioIds: [],
        datasetIds: [],
      },
      permissions: { toolIds: ["deployer-history"] },
      verification: {
        datasetIds: [
          "deployer-forensics-smoke",
          "deployer-forensics-protected",
        ],
        minimumPassRate: 1,
      },
    },
    inputSchema: createDeployerForensicsInputSchema(effectivePolicy),
    outputSchema: deployerForensicsOutputSchema,
    revisionSurface: defineAgentRevisionSurface<DeployerForensicsPolicy>({
      schema: deployerForensicsPolicySchema,
      baselinePolicy: deployerForensicsBaselinePolicy,
      mutableFields: ["instructions", "rubric"],
      createCandidate: createDeployerForensicsAgent,
    }),
    async execute(input, services) {
      const tool = services.tools.get<
        DeployerHistoryInput,
        DeployerHistoryOutput
      >("deployer-history");
      const result = await runDeployerForensics(
        tool,
        services.provider,
        {
          deployer: input.deployer,
          chain: input.chain,
          token: input.token,
          instruction: input.instruction,
        },
        effectivePolicy,
      );
      return {
        forensicsRunId: result.forensicsRunId,
        succeeded: result.succeeded,
        actorReputation: result.parsedOutput?.actorReputation ?? null,
        riskFlags: result.parsedOutput?.riskFlags ?? [],
        priorTokenCount: result.dossier.output?.summary.prior_count ?? 0,
        confidence: result.parsedOutput?.confidence ?? null,
        rationale: result.parsedOutput?.rationale ?? null,
        forensicsEvidence: result as unknown as z.infer<
          ReturnType<typeof z.json>
        >,
      };
    },
    assess(output) {
      return {
        passed: output.succeeded,
        message: output.succeeded
          ? "Deployer forensics produced a grounded, evidence-cited judgment."
          : "Deployer forensics did not produce a grounded successful judgment.",
      };
    },
  });
}

export const deployerForensicsAgent = createDeployerForensicsAgent();
