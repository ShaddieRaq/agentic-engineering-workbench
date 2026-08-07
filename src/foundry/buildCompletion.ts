import { z } from "zod";

// Decision 088: a build-completion record closes a generation. It is the
// only artifact that states what "done" meant for a build: which slices
// were approved, which suite (by digest) passed in full — holdouts
// included — against which commit of the project repo, signed by the
// operator. Evolution rounds descend from a completion; none may begin
// without a green one.

export const buildCompletionVerificationFileSchema = z
  .object({
    path: z.string().min(1).max(500),
    visibility: z.enum(["visible", "holdout"]),
    exitCode: z.number().int(),
    passed: z.boolean(),
  })
  .strict();

export const buildCompletionSchema = z
  .object({
    completionId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    planId: z.uuid(),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    testSuiteId: z.uuid(),
    testSuiteDigest: z.string().regex(/^[a-f0-9]{64}$/),
    projectRoot: z.string().min(1).max(1_000),
    mainCommitSha: z.string().regex(/^[a-f0-9]{7,40}$/),
    // Workbench-computed digest over the project tree (excluding .git and
    // node_modules) — the trust anchor is our own hash, not git's.
    treeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    builtSliceIds: z.array(z.uuid()).min(1).max(20),
    verification: z
      .object({
        files: z.array(buildCompletionVerificationFileSchema).min(1).max(40),
        passed: z.boolean(),
        // Visible-file output only: holdout output stays out of the record
        // (Decision 088 redaction rule).
        outputExcerpt: z.string().max(20_000),
      })
      .strict(),
    operatorId: z.string().min(1).max(200),
    // True when the record was created after the fact for a build that
    // predates Decision 088 (digests computed at recording time, not at
    // merge time). The evidence is weaker and says so.
    recordedRetroactively: z.boolean(),
    createdAt: z.string().min(1),
  })
  .strict()
  .superRefine((completion, context) => {
    if (!completion.verification.passed) {
      context.addIssue({
        code: "custom",
        path: ["verification", "passed"],
        message: "A build completion cannot record a failing verification.",
      });
    }
    if (completion.verification.files.some(({ passed }) => !passed)) {
      context.addIssue({
        code: "custom",
        path: ["verification", "files"],
        message: "A build completion cannot include failing test files.",
      });
    }
  });

export type BuildCompletion = z.infer<typeof buildCompletionSchema>;
