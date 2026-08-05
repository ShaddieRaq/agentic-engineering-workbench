import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";
import { testSuiteSchema, type TestSuite } from "./testSuite.js";

export const testSuiteDecisionKindSchema = z.enum([
  "approve",
  "reject",
  "revise",
]);

export const testSuiteDecisionSchema = z
  .object({
    decisionId: z.uuid(),
    decision: testSuiteDecisionKindSchema,
    testSuiteId: z.uuid(),
    testSuiteArtifactId: z.string().min(1),
    testSuiteDigest: z.string().regex(/^[a-f0-9]{64}$/),
    capabilityPlanId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    operatorId: z.string().min(1).max(200),
    rationale: z.string().min(1).max(8_000),
    requestedRevisions: z
      .array(z.string().min(1).max(2_000))
      .min(1)
      .max(20)
      .nullable(),
    decidedAt: z.string().min(1),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.decision === "revise" && decision.requestedRevisions === null) {
      context.addIssue({
        code: "custom",
        path: ["requestedRevisions"],
        message: "A revise decision must list the requested revisions.",
      });
    }
    if (decision.decision !== "revise" && decision.requestedRevisions !== null) {
      context.addIssue({
        code: "custom",
        path: ["requestedRevisions"],
        message: "Only a revise decision may include requested revisions.",
      });
    }
  });

export type TestSuiteDecisionKind = z.infer<typeof testSuiteDecisionKindSchema>;
export type TestSuiteDecision = z.infer<typeof testSuiteDecisionSchema>;

export function createTestSuiteDecision(input: {
  testSuite: TestSuite;
  testSuiteArtifactId: string;
  decision: TestSuiteDecisionKind;
  operatorId: string;
  rationale: string;
  requestedRevisions?: string[] | null;
  decisionId?: string;
  decidedAt?: string;
}): TestSuiteDecision {
  const testSuite = testSuiteSchema.parse(input.testSuite);

  if (input.decision === "approve") {
    const blockingConcerns = testSuite.content.concerns.filter(
      ({ severity }) => severity === "blocking",
    );
    if (blockingConcerns.length > 0) {
      throw new Error(
        `A test suite with blocking concerns cannot be approved: ${blockingConcerns
          .map(({ id }) => id)
          .join(", ")}.`,
      );
    }
  }

  return testSuiteDecisionSchema.parse({
    decisionId: input.decisionId ?? randomUUID(),
    decision: input.decision,
    testSuiteId: testSuite.testSuiteId,
    testSuiteArtifactId: input.testSuiteArtifactId,
    testSuiteDigest: digestJsonEvidence(testSuite),
    capabilityPlanId: testSuite.capabilityPlanId,
    briefId: testSuite.briefId,
    briefVersion: testSuite.briefVersion,
    operatorId: input.operatorId,
    rationale: input.rationale,
    requestedRevisions: input.requestedRevisions ?? null,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  });
}
