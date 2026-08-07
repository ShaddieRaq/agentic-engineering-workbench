import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digestJsonEvidence } from "../agents/agentEvidenceDigest.js";

export const submissionTestFileResultSchema = z
  .object({
    path: z.string().min(1).max(200),
    visibility: z.enum(["visible", "holdout"]),
    exitCode: z.number().int(),
    passed: z.boolean(),
  })
  .strict();

export const sliceSubmissionSchema = z
  .object({
    submissionId: z.uuid(),
    workOrderId: z.uuid(),
    workOrderDigest: z.string().regex(/^[a-f0-9]{64}$/),
    testSuiteId: z.uuid(),
    sliceId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    projectRoot: z.string().min(1),
    // Evolution pins (Decision 088): what the delta was verified against.
    baselineCommitSha: z
      .string()
      .regex(/^[a-f0-9]{7,40}$/)
      .optional(),
    headCommitSha: z
      .string()
      .regex(/^[a-f0-9]{7,40}$/)
      .optional(),
    scopeCheck: z
      .object({
        passed: z.boolean(),
        failures: z.array(z.string().min(1).max(500)).max(50),
      })
      .strict(),
    testRun: z
      .object({
        files: z.array(submissionTestFileResultSchema).max(40),
        passed: z.boolean(),
        outputExcerpt: z.string().max(20_000),
      })
      .strict(),
    status: z.enum(["passed", "failed"]),
    createdAt: z.string().min(1),
    // Optional so submissions persisted before isolation existed load.
    // out-of-tree: verified against a frozen copy under the Workbench root
    // that the builder session is structurally denied from reading.
    verificationMode: z.enum(["in-place", "out-of-tree"]).optional(),
  })
  .strict();

export const submissionDecisionKindSchema = z.enum([
  "approve",
  "reject",
  "revise",
]);

export const submissionDecisionSchema = z
  .object({
    decisionId: z.uuid(),
    decision: submissionDecisionKindSchema,
    submissionId: z.uuid(),
    submissionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    workOrderId: z.uuid(),
    testSuiteId: z.uuid(),
    sliceId: z.uuid(),
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

export type SliceSubmission = z.infer<typeof sliceSubmissionSchema>;
export type SubmissionDecisionKind = z.infer<typeof submissionDecisionKindSchema>;
export type SubmissionDecision = z.infer<typeof submissionDecisionSchema>;

export function createSubmissionDecision(input: {
  submission: SliceSubmission;
  decision: SubmissionDecisionKind;
  operatorId: string;
  rationale: string;
  requestedRevisions?: string[] | null;
  decisionId?: string;
  decidedAt?: string;
}): SubmissionDecision {
  const submission = sliceSubmissionSchema.parse(input.submission);

  if (input.decision === "approve" && submission.status !== "passed") {
    throw new Error(
      "A submission whose Workbench verification did not pass cannot be approved.",
    );
  }

  return submissionDecisionSchema.parse({
    decisionId: input.decisionId ?? randomUUID(),
    decision: input.decision,
    submissionId: submission.submissionId,
    submissionDigest: digestJsonEvidence(submission),
    workOrderId: submission.workOrderId,
    testSuiteId: submission.testSuiteId,
    sliceId: submission.sliceId,
    briefId: submission.briefId,
    briefVersion: submission.briefVersion,
    operatorId: input.operatorId,
    rationale: input.rationale,
    requestedRevisions: input.requestedRevisions ?? null,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  });
}
