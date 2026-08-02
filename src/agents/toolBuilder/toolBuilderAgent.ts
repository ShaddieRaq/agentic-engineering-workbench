import { z } from "zod";
import { defineAgent } from "../agentRegistration.js";
import {
  runToolProposal,
  toolProposalDispositionSchema,
} from "./toolProposal.js";

export const toolBuilderInputSchema = z
  .object({
    request: z.string().min(10),
    targetToolId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    allowSideEffects: z.boolean().default(false),
    additionalConstraints: z.array(z.string().min(1)).max(20).default([]),
  })
  .strict();

export const toolBuilderOutputSchema = z
  .object({
    proposalRunId: z.string().min(1),
    succeeded: z.boolean(),
    disposition: toolProposalDispositionSchema.nullable(),
    summary: z.string().nullable(),
    toolId: z.string().nullable(),
    policyEvaluation: z
      .object({
        passed: z.boolean(),
        issues: z.array(z.string().min(1)),
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
    proposalEvidence: z.json(),
  })
  .strict();

export const toolBuilderAgent = defineAgent({
  manifest: {
    id: "tool-builder",
    name: "Tool Builder",
    version: "0.1.0",
    status: "experimental",
    description:
      "Generates reviewable, policy-checked TypeScript tool implementation proposals and tests without writing code.",
    owner: "local-platform",
    tags: ["authoring", "engineering", "tools"],
    defaultModel: "gpt-5.4-mini",
    components: {
      workflowIds: ["tool-proposal"],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: { toolIds: [] },
    verification: {
      datasetIds: ["tool-builder-smoke"],
      minimumPassRate: 1,
    },
  },
  inputSchema: toolBuilderInputSchema,
  outputSchema: toolBuilderOutputSchema,
  async execute(input, services) {
    const result = await runToolProposal(services.provider, input);

    return {
      proposalRunId: result.proposalRunId,
      succeeded: result.succeeded,
      disposition: result.parsedOutput?.disposition ?? null,
      summary: result.parsedOutput?.summary ?? null,
      toolId: result.parsedOutput?.contract?.id ?? null,
      policyEvaluation: result.policyEvaluation,
      proposalEvidence: result as unknown as z.infer<ReturnType<typeof z.json>>,
    };
  },
  assess(output) {
    return {
      passed: output.succeeded,
      message: output.succeeded
        ? "Tool proposal completed within the authoring safety policy."
        : "Tool proposal did not satisfy the authoring safety policy.",
    };
  },
});
