import { z } from "zod";
import type { ProjectBrief } from "./projectBrief.js";

export const architectureComponentSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(200),
    responsibility: z.string().min(1).max(2_000),
    dependsOnComponentIds: z.array(z.uuid()).max(20),
  })
  .strict();

export const architectureDecisionSchema = z
  .object({
    id: z.uuid(),
    decision: z.string().min(1).max(2_000),
    rationale: z.string().min(1).max(2_000),
    relatedBriefEntryIds: z.array(z.uuid()).max(20),
  })
  .strict();

export const acceptanceMappingSchema = z
  .object({
    criterionId: z.uuid(),
    testType: z.enum(["unit", "integration", "end-to-end", "manual"]),
    verificationApproach: z.string().min(1).max(2_000),
    independentOfImplementation: z.boolean(),
  })
  .strict();

export const implementationSliceSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(200),
    delivers: z.string().min(1).max(2_000),
    dependsOnSliceIds: z.array(z.uuid()).max(10),
    verifiedByCriterionIds: z.array(z.uuid()).min(1).max(20),
  })
  .strict();

export const architectureConcernSchema = z
  .object({
    id: z.uuid(),
    description: z.string().min(1).max(2_000),
    severity: z.enum(["blocking", "advisory"]),
    relatedBriefEntryIds: z.array(z.uuid()).max(20),
  })
  .strict();

const planContentShape = {
  overview: z.string().min(1).max(4_000),
  components: z.array(architectureComponentSchema).min(1).max(30),
  decisions: z.array(architectureDecisionSchema).max(30),
  acceptancePlan: z.array(acceptanceMappingSchema).min(1).max(50),
  implementationSlices: z.array(implementationSliceSchema).min(1).max(20),
  concerns: z.array(architectureConcernSchema).max(30),
};

// The structural contract sent to the provider: internal and cross-brief
// integrity are validated after deterministic reconciliation, not here.
export const architecturePlanContentShapeSchema = z
  .object(planContentShape)
  .strict();

function refinePlanContent(
  content: ArchitecturePlanContentShape,
  context: z.core.$RefinementCtx,
): void {
  const seenIds = new Set<string>();
  const componentIds = new Set<string>();
  const sliceIds = new Set<string>();

  for (const component of content.components) {
    if (seenIds.has(component.id)) {
      context.addIssue({
        code: "custom",
        path: ["components"],
        message: `Duplicate plan element ID: ${component.id}.`,
      });
    }
    seenIds.add(component.id);
    componentIds.add(component.id);
  }
  for (const section of [content.decisions, content.concerns]) {
    for (const element of section) {
      if (seenIds.has(element.id)) {
        context.addIssue({
          code: "custom",
          path: ["decisions"],
          message: `Duplicate plan element ID: ${element.id}.`,
        });
      }
      seenIds.add(element.id);
    }
  }
  for (const slice of content.implementationSlices) {
    if (seenIds.has(slice.id)) {
      context.addIssue({
        code: "custom",
        path: ["implementationSlices"],
        message: `Duplicate plan element ID: ${slice.id}.`,
      });
    }
    seenIds.add(slice.id);
    sliceIds.add(slice.id);
  }

  for (const component of content.components) {
    for (const dependencyId of component.dependsOnComponentIds) {
      if (!componentIds.has(dependencyId)) {
        context.addIssue({
          code: "custom",
          path: ["components"],
          message: `Component ${component.id} depends on unknown component ${dependencyId}.`,
        });
      }
    }
  }
  for (const slice of content.implementationSlices) {
    for (const dependencyId of slice.dependsOnSliceIds) {
      if (!sliceIds.has(dependencyId)) {
        context.addIssue({
          code: "custom",
          path: ["implementationSlices"],
          message: `Slice ${slice.id} depends on unknown slice ${dependencyId}.`,
        });
      }
      if (dependencyId === slice.id) {
        context.addIssue({
          code: "custom",
          path: ["implementationSlices"],
          message: `Slice ${slice.id} cannot depend on itself.`,
        });
      }
    }
  }
}

export const architecturePlanContentSchema =
  architecturePlanContentShapeSchema.superRefine(refinePlanContent);

export const architectureReconciliationSchema = z
  .object({
    removedReferences: z
      .array(
        z
          .object({
            context: z.enum([
              "decisions",
              "concerns",
              "components",
              "implementationSlices",
            ]),
            ownerId: z.uuid(),
            removedId: z.uuid(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const architectPlanOutputSchema = z
  .object({
    ...planContentShape,
    reconciliation: architectureReconciliationSchema.nullable(),
  })
  .strict()
  .superRefine((output, context) => {
    refinePlanContent(output, context);
  });

export const architecturePlanSchema = z
  .object({
    planId: z.uuid(),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    briefArtifactId: z.string().min(1),
    briefDigest: z.string().regex(/^[a-f0-9]{64}$/),
    agentRunArtifactId: z.string().min(1).nullable(),
    content: architecturePlanContentSchema,
    reconciliation: architectureReconciliationSchema.nullable(),
    createdAt: z.string().min(1),
    // Optional so artifacts persisted before revision lineage existed load.
    revisedFromArtifactId: z.string().min(1).optional(),
    revisionDecisionId: z.uuid().optional(),
    // Evolution lineage (Decision 088): the completion record this plan
    // descends from, plus the Workbench-COMPUTED disposition of every
    // slice. The model never authors these; carried means the slice id is
    // in the completion's built set AND the slice is content-identical to
    // the prior approved plan.
    evolvesFromCompletionId: z.uuid().optional(),
    sliceDispositions: z
      .array(
        z
          .object({
            sliceId: z.uuid(),
            disposition: z.enum(["carried", "delta"]),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

export type ArchitecturePlanContentShape = z.infer<
  typeof architecturePlanContentShapeSchema
>;
export type ArchitecturePlanContent = z.infer<typeof architecturePlanContentSchema>;
export type ArchitectureReconciliation = z.infer<
  typeof architectureReconciliationSchema
>;
export type ArchitectPlanOutput = z.infer<typeof architectPlanOutputSchema>;
export type ArchitecturePlan = z.infer<typeof architecturePlanSchema>;

export interface PlanBriefValidation {
  passed: boolean;
  failures: string[];
}

export function validatePlanAgainstBrief(
  content: ArchitecturePlanContentShape,
  brief: ProjectBrief,
): PlanBriefValidation {
  const failures: string[] = [];
  const entryIds = new Set<string>();
  for (const section of [
    brief.goals,
    brief.users,
    brief.constraints,
    brief.risks,
    brief.nonGoals,
    brief.assumptions,
    brief.acceptanceCriteria,
  ]) {
    for (const entry of section) entryIds.add(entry.id);
  }
  const criterionIds = new Set(brief.acceptanceCriteria.map(({ id }) => id));

  const coveredCriterionIds = new Set<string>();
  for (const mapping of content.acceptancePlan) {
    if (!criterionIds.has(mapping.criterionId)) {
      failures.push(
        `Acceptance mapping references unknown brief criterion ${mapping.criterionId}.`,
      );
    } else {
      coveredCriterionIds.add(mapping.criterionId);
    }
  }
  for (const criterionId of criterionIds) {
    if (!coveredCriterionIds.has(criterionId)) {
      failures.push(
        `Brief acceptance criterion ${criterionId} is not covered by the acceptance plan.`,
      );
    }
  }

  for (const section of [content.decisions, content.concerns]) {
    for (const element of section) {
      for (const relatedId of element.relatedBriefEntryIds) {
        if (!entryIds.has(relatedId)) {
          failures.push(
            `Plan element ${element.id} references unknown brief entry ${relatedId}.`,
          );
        }
      }
    }
  }

  for (const slice of content.implementationSlices) {
    for (const criterionId of slice.verifiedByCriterionIds) {
      if (!criterionIds.has(criterionId)) {
        failures.push(
          `Slice ${slice.id} is verified by unknown brief criterion ${criterionId}.`,
        );
      }
    }
  }

  return { passed: failures.length === 0, failures };
}
