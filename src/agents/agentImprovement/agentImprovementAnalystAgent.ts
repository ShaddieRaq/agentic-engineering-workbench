import { z } from "zod";
import { defineAgent } from "../agentRegistration.js";
import { runAgentImprovementAnalysis } from "./agentImprovementAnalysis.js";
import { agentImprovementEvidencePacketSchema } from "./agentImprovementEvidence.js";
import {
  agentImprovementDispositionSchema,
  agentImprovementRecommendationCategorySchema,
} from "./agentImprovementProposal.js";

export const agentImprovementAnalystOutputSchema = z
  .object({
    analysisRunId: z.string().min(1),
    succeeded: z.boolean(),
    subjectAgentId: z.string().min(1),
    disposition: agentImprovementDispositionSchema.nullable(),
    summary: z.string().nullable(),
    recommendationCategories: z.array(
      agentImprovementRecommendationCategorySchema,
    ),
    hasCandidatePolicyPatch: z.boolean(),
    policyEvaluation: z
      .object({
        passed: z.boolean(),
        citedEvidenceIds: z.array(z.string().min(1)),
        invalidEvidenceIds: z.array(z.string().min(1)),
        issues: z.array(z.string().min(1)),
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
    analysisEvidence: z.json(),
  })
  .strict();

export type AgentImprovementAnalystOutput = z.infer<
  typeof agentImprovementAnalystOutputSchema
>;

export const agentImprovementAnalystExpectationSchema = z
  .object({
    disposition: agentImprovementDispositionSchema,
    requiredRecommendationCategories: z
      .array(agentImprovementRecommendationCategorySchema)
      .refine(
        (categories) => new Set(categories).size === categories.length,
        { message: "Expected recommendation categories must be unique." },
      ),
    hasCandidatePolicyPatch: z.boolean(),
  })
  .strict();

export const agentImprovementAnalystAgent = defineAgent({
  manifest: {
    id: "agent-improvement-analyst",
    name: "Agent Improvement Analyst",
    version: "0.2.0",
    status: "experimental",
    description:
      "Analyzes bounded evaluation evidence and produces grounded, policy-checked agent improvement proposals.",
    owner: "local-platform",
    tags: ["agent-development", "evaluation", "optimization"],
    defaultModel: "gpt-5.4",
    components: {
      workflowIds: ["agent-improvement-analysis"],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: { toolIds: [] },
    verification: {
      datasetIds: ["agent-improvement-analyst-smoke"],
      minimumPassRate: 1,
    },
  },
  inputSchema: agentImprovementEvidencePacketSchema,
  outputSchema: agentImprovementAnalystOutputSchema,
  async execute(input, services): Promise<AgentImprovementAnalystOutput> {
    const result = await runAgentImprovementAnalysis(services.provider, input);
    const categories = result.parsedOutput?.recommendations.map(
      ({ category }) => category,
    ) ?? [];

    return {
      analysisRunId: result.analysisRunId,
      succeeded: result.succeeded,
      subjectAgentId: result.packet.subject.agentId,
      disposition: result.parsedOutput?.disposition ?? null,
      summary: result.parsedOutput?.summary ?? null,
      recommendationCategories: [...new Set(categories)],
      hasCandidatePolicyPatch:
        result.parsedOutput?.candidatePolicyPatch !== null &&
        result.parsedOutput?.candidatePolicyPatch !== undefined,
      policyEvaluation: result.policyEvaluation,
      analysisEvidence: result as unknown as z.infer<ReturnType<typeof z.json>>,
    };
  },
  assess(output) {
    return {
      passed: output.succeeded,
      message: output.succeeded
        ? "Improvement analysis completed with grounded policy evidence."
        : "Improvement analysis did not produce a grounded policy-valid proposal.",
    };
  },
  assessDatasetCase(_input, output, rawExpected) {
    const expected = agentImprovementAnalystExpectationSchema.parse(rawExpected);
    const missingCategories = expected.requiredRecommendationCategories.filter(
      (category) => !output.recommendationCategories.includes(category),
    );
    const dispositionMatches = output.disposition === expected.disposition;
    const patchMatches =
      output.hasCandidatePolicyPatch === expected.hasCandidatePolicyPatch;
    const passed =
      output.succeeded &&
      dispositionMatches &&
      patchMatches &&
      missingCategories.length === 0;

    return {
      passed,
      message: passed
        ? "Disposition, recommendation categories, and candidate boundary match hidden ground truth."
        : [
            dispositionMatches
              ? null
              : `Expected ${expected.disposition}; received ${output.disposition ?? "no disposition"}.`,
            patchMatches
              ? null
              : `Expected candidate patch ${expected.hasCandidatePolicyPatch ? "present" : "absent"}.`,
            missingCategories.length === 0
              ? null
              : `Missing recommendation categories: ${missingCategories.join(", ")}.`,
          ]
            .filter((message): message is string => message !== null)
            .join(" "),
    };
  },
});
