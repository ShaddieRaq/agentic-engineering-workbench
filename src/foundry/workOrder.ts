import { z } from "zod";

export const workOrderCriterionSchema = z
  .object({
    id: z.uuid(),
    text: z.string().min(1).max(2_000),
    verification: z.string().min(1).max(2_000),
  })
  .strict();

export const workOrderSchema = z
  .object({
    workOrderId: z.uuid(),
    testSuiteId: z.uuid(),
    testSuiteDigest: z.string().regex(/^[a-f0-9]{64}$/),
    planId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    sliceId: z.uuid(),
    sliceTitle: z.string().min(1).max(200),
    sliceDelivers: z.string().min(1).max(2_000),
    dependsOnSliceIds: z.array(z.uuid()).max(10),
    criteria: z.array(workOrderCriterionSchema).min(1).max(20),
    applicableTestFilePaths: z.array(z.string().min(1).max(200)).max(40),
    interfaceContract: z.string().min(1).max(4_000),
    builderInstructions: z.array(z.string().min(1).max(500)).min(1).max(20),
    forbiddenPaths: z.array(z.string().min(1).max(200)).min(1).max(10),
    createdAt: z.string().min(1),
    // Evolution pins (Decision 088): the completion record this delta
    // work descends from, with the commit and tree the builder must build
    // on. Verification refuses a HEAD that does not descend from the
    // pinned baseline.
    evolvesFromCompletionId: z.uuid().optional(),
    baselineCommitSha: z
      .string()
      .regex(/^[a-f0-9]{7,40}$/)
      .optional(),
    baselineTreeDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export type WorkOrderCriterion = z.infer<typeof workOrderCriterionSchema>;
export type WorkOrder = z.infer<typeof workOrderSchema>;

export const BUILDER_INSTRUCTIONS: string[] = [
  "Implement this slice against the interface contract; the acceptance tests are the executable specification.",
  "Run the visible acceptance tests locally while you work; the Workbench re-runs them plus withheld holdout tests at submission.",
  "Never create, modify, or delete anything under acceptance-tests/; submission verification checks those files byte-for-byte against the approved suite.",
  "Never read Workbench evidence artifacts to discover holdout test content.",
  "Work on a dedicated slice branch in the project repository and keep changes scoped to this slice's delivery.",
  "Configure the project so `npm test` runs vitest; the Workbench invokes targeted vitest runs through its controlled runner.",
  "Submission is judged only on Workbench-run evidence: the scope check and the applicable visible and holdout tests.",
];
