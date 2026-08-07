import { transformSync } from "esbuild";
import { z } from "zod";
import type { ArchitecturePlan } from "./architecturePlan.js";
import type { ProjectBrief } from "./projectBrief.js";

export const testFileVisibilitySchema = z.enum(["visible", "holdout"]);

export const testFileSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(200)
      .regex(/^acceptance-tests\/[a-zA-Z0-9_\/-]+\.test\.ts$/, {
        message:
          "Test paths must be relative, live under acceptance-tests/, and end with .test.ts.",
      }),
    content: z.string().min(1).max(20_000),
    visibility: testFileVisibilitySchema,
    coveredCriterionIds: z.array(z.uuid()).min(1).max(20),
    testType: z.enum(["unit", "integration", "end-to-end"]),
  })
  .strict()
  .superRefine((file, context) => {
    if (file.path.split("/").includes("..")) {
      context.addIssue({
        code: "custom",
        path: ["path"],
        message: "Test paths must not contain traversal segments.",
      });
    }
  });

export const manualCheckSchema = z
  .object({
    id: z.uuid(),
    criterionId: z.uuid(),
    instructions: z.string().min(1).max(2_000),
  })
  .strict();

export const testSuiteConcernSchema = z
  .object({
    id: z.uuid(),
    description: z.string().min(1).max(2_000),
    severity: z.enum(["blocking", "advisory"]),
    relatedCriterionIds: z.array(z.uuid()).max(20),
  })
  .strict();

const testSuiteContentShape = {
  interfaceContract: z.string().min(1).max(4_000),
  testFiles: z.array(testFileSchema).min(1).max(40),
  manualChecks: z.array(manualCheckSchema).max(20),
  concerns: z.array(testSuiteConcernSchema).max(30),
};

export const testSuiteContentShapeSchema = z
  .object(testSuiteContentShape)
  .strict();

function refineTestSuiteContent(
  content: TestSuiteContentShape,
  context: z.core.$RefinementCtx,
): void {
  const seenPaths = new Set<string>();
  for (const file of content.testFiles) {
    if (seenPaths.has(file.path)) {
      context.addIssue({
        code: "custom",
        path: ["testFiles"],
        message: `Duplicate test file path: ${file.path}.`,
      });
    }
    seenPaths.add(file.path);
  }
  const seenIds = new Set<string>();
  for (const section of [content.manualChecks, content.concerns]) {
    for (const element of section) {
      if (seenIds.has(element.id)) {
        context.addIssue({
          code: "custom",
          path: ["manualChecks"],
          message: `Duplicate test suite element ID: ${element.id}.`,
        });
      }
      seenIds.add(element.id);
    }
  }
}

export const testSuiteContentSchema =
  testSuiteContentShapeSchema.superRefine(refineTestSuiteContent);

export const testSuiteReconciliationSchema = z
  .object({
    removedReferences: z
      .array(
        z
          .object({
            context: z.enum(["testFiles", "concerns"]),
            ownerPathOrId: z.string().min(1),
            removedId: z.uuid(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const testSuiteOutputSchema = z
  .object({
    ...testSuiteContentShape,
    reconciliation: testSuiteReconciliationSchema.nullable(),
  })
  .strict()
  .superRefine((output, context) => {
    refineTestSuiteContent(output, context);
  });

export const testSuiteSchema = z
  .object({
    testSuiteId: z.uuid(),
    capabilityPlanId: z.uuid(),
    capabilityPlanDigest: z.string().regex(/^[a-f0-9]{64}$/),
    planId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    agentRunArtifactId: z.string().min(1).nullable(),
    content: testSuiteContentSchema,
    reconciliation: testSuiteReconciliationSchema.nullable(),
    createdAt: z.string().min(1),
    // Optional so artifacts persisted before revision lineage existed load.
    revisedFromArtifactId: z.string().min(1).optional(),
    revisionDecisionId: z.uuid().optional(),
    // Evolution succession (Decision 088): the prior approved suite this
    // one supersedes, plus the Workbench-COMPUTED per-file lineage and the
    // retired prior paths. The model never authors these.
    evolvesFromTestSuiteId: z.uuid().optional(),
    fileLineage: z
      .array(
        z
          .object({
            path: z.string().min(1).max(500),
            lineage: z.enum(["carried", "revised", "new"]),
            priorContentDigest: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .nullable(),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    retiredFilePaths: z.array(z.string().min(1).max(500)).max(40).optional(),
  })
  .strict();

export type TestFile = z.infer<typeof testFileSchema>;
export type TestSuiteContentShape = z.infer<typeof testSuiteContentShapeSchema>;
export type TestSuiteContent = z.infer<typeof testSuiteContentSchema>;
export type TestSuiteReconciliation = z.infer<
  typeof testSuiteReconciliationSchema
>;
export type TestSuiteOutput = z.infer<typeof testSuiteOutputSchema>;
export type TestSuite = z.infer<typeof testSuiteSchema>;

export interface TestSuiteValidation {
  passed: boolean;
  failures: string[];
}

function syntaxDiagnostics(content: string): string[] {
  try {
    transformSync(content, { loader: "ts" });
    return [];
  } catch (error: unknown) {
    const failure = error as { errors?: { text: string }[] };
    if (failure.errors && failure.errors.length > 0) {
      return failure.errors.map(({ text }) => text);
    }
    return [error instanceof Error ? error.message : String(error)];
  }
}

export function validateTestSuite(
  content: TestSuiteContentShape,
  brief: ProjectBrief,
  plan: ArchitecturePlan,
): TestSuiteValidation {
  const failures: string[] = [];
  const criterionIds = new Set(brief.acceptanceCriteria.map(({ id }) => id));

  for (const file of content.testFiles) {
    for (const criterionId of file.coveredCriterionIds) {
      if (!criterionIds.has(criterionId)) {
        failures.push(
          `Test file ${file.path} covers unknown criterion ${criterionId}.`,
        );
      }
    }
    const errors = syntaxDiagnostics(file.content);
    for (const error of errors) {
      failures.push(`Test file ${file.path} has a syntax error: ${error}`);
    }
  }
  for (const check of content.manualChecks) {
    if (!criterionIds.has(check.criterionId)) {
      failures.push(
        `Manual check ${check.id} references unknown criterion ${check.criterionId}.`,
      );
    }
  }
  for (const concern of content.concerns) {
    for (const criterionId of concern.relatedCriterionIds) {
      if (!criterionIds.has(criterionId)) {
        failures.push(
          `Concern ${concern.id} references unknown criterion ${criterionId}.`,
        );
      }
    }
  }

  const visiblyCovered = new Set(
    content.testFiles
      .filter(({ visibility }) => visibility === "visible")
      .flatMap(({ coveredCriterionIds }) => coveredCriterionIds),
  );
  const manuallyCovered = new Set(
    content.manualChecks.map(({ criterionId }) => criterionId),
  );
  for (const mapping of plan.content.acceptancePlan) {
    if (!criterionIds.has(mapping.criterionId)) continue;
    if (mapping.testType === "manual") {
      if (!manuallyCovered.has(mapping.criterionId)) {
        failures.push(
          `Manual acceptance mapping for criterion ${mapping.criterionId} has no manual check.`,
        );
      }
    } else if (!visiblyCovered.has(mapping.criterionId)) {
      failures.push(
        `Criterion ${mapping.criterionId} is not covered by any visible test file.`,
      );
    }
  }

  return { passed: failures.length === 0, failures };
}
