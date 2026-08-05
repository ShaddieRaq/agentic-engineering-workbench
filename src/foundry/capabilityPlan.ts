import { z } from "zod";
import type { ArchitecturePlan } from "./architecturePlan.js";

export const capabilityResolutionSchema = z.enum([
  "existing-agent",
  "existing-tool",
  "project-code",
  "human",
  "engineering-change-required",
]);

export const capabilityNeedSchema = z
  .object({
    id: z.uuid(),
    need: z.string().min(1).max(2_000),
    resolution: capabilityResolutionSchema,
    capabilityId: z.string().min(1).nullable(),
    rationale: z.string().min(1).max(2_000),
    relatedSliceIds: z.array(z.uuid()).min(1).max(20),
  })
  .strict();

export const proposedCapabilitySchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(200),
    contractSketch: z.string().min(1).max(2_000),
    route: z.enum(["tool-builder", "human-engineering"]),
    relatedNeedIds: z.array(z.uuid()).min(1).max(20),
  })
  .strict();

export const capabilityConcernSchema = z
  .object({
    id: z.uuid(),
    description: z.string().min(1).max(2_000),
    severity: z.enum(["blocking", "advisory"]),
    relatedSliceIds: z.array(z.uuid()).max(20),
  })
  .strict();

const capabilityContentShape = {
  overview: z.string().min(1).max(4_000),
  needs: z.array(capabilityNeedSchema).min(1).max(50),
  proposedCapabilities: z.array(proposedCapabilitySchema).max(20),
  concerns: z.array(capabilityConcernSchema).max(30),
};

// The structural contract sent to the provider.
export const capabilityPlanContentShapeSchema = z
  .object(capabilityContentShape)
  .strict();

function refineCapabilityContent(
  content: CapabilityPlanContentShape,
  context: z.core.$RefinementCtx,
): void {
  const seenIds = new Set<string>();
  const needIds = new Set<string>();
  for (const need of content.needs) {
    if (seenIds.has(need.id)) {
      context.addIssue({
        code: "custom",
        path: ["needs"],
        message: `Duplicate capability element ID: ${need.id}.`,
      });
    }
    seenIds.add(need.id);
    needIds.add(need.id);

    const requiresCatalogId =
      need.resolution === "existing-agent" || need.resolution === "existing-tool";
    if (requiresCatalogId && need.capabilityId === null) {
      context.addIssue({
        code: "custom",
        path: ["needs"],
        message: `Need ${need.id} resolves to ${need.resolution} but names no capabilityId.`,
      });
    }
    if (!requiresCatalogId && need.capabilityId !== null) {
      context.addIssue({
        code: "custom",
        path: ["needs"],
        message: `Need ${need.id} resolves to ${need.resolution} and must not name a capabilityId.`,
      });
    }
  }
  for (const section of [content.proposedCapabilities, content.concerns]) {
    for (const element of section) {
      if (seenIds.has(element.id)) {
        context.addIssue({
          code: "custom",
          path: ["proposedCapabilities"],
          message: `Duplicate capability element ID: ${element.id}.`,
        });
      }
      seenIds.add(element.id);
    }
  }

  for (const proposal of content.proposedCapabilities) {
    for (const needId of proposal.relatedNeedIds) {
      if (!needIds.has(needId)) {
        context.addIssue({
          code: "custom",
          path: ["proposedCapabilities"],
          message: `Proposal ${proposal.id} references unknown need ${needId}.`,
        });
      }
    }
  }

  const proposedNeedIds = new Set(
    content.proposedCapabilities.flatMap(({ relatedNeedIds }) => relatedNeedIds),
  );
  for (const need of content.needs) {
    if (
      need.resolution === "engineering-change-required" &&
      !proposedNeedIds.has(need.id)
    ) {
      context.addIssue({
        code: "custom",
        path: ["needs"],
        message: `Need ${need.id} requires an engineering change but no capability proposal references it.`,
      });
    }
  }
}

export const capabilityPlanContentSchema =
  capabilityPlanContentShapeSchema.superRefine(refineCapabilityContent);

export const capabilityReconciliationSchema = z
  .object({
    removedReferences: z
      .array(
        z
          .object({
            context: z.enum(["needs", "concerns", "proposedCapabilities"]),
            ownerId: z.uuid(),
            removedId: z.uuid(),
          })
          .strict(),
      )
      .max(100),
    droppedNeedIds: z.array(z.uuid()).max(50),
  })
  .strict();

export const capabilityPlanOutputSchema = z
  .object({
    ...capabilityContentShape,
    reconciliation: capabilityReconciliationSchema.nullable(),
  })
  .strict()
  .superRefine((output, context) => {
    refineCapabilityContent(output, context);
  });

export const capabilityCatalogSchema = z
  .object({
    agents: z
      .array(
        z.object({ id: z.string().min(1), description: z.string().min(1) }).strict(),
      )
      .max(100),
    tools: z
      .array(
        z.object({ id: z.string().min(1), description: z.string().min(1) }).strict(),
      )
      .max(200),
  })
  .strict();

export const capabilityPlanSchema = z
  .object({
    capabilityPlanId: z.uuid(),
    planId: z.uuid(),
    planArtifactId: z.string().min(1),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    briefId: z.uuid(),
    briefVersion: z.number().int().min(1),
    agentRunArtifactId: z.string().min(1).nullable(),
    catalog: capabilityCatalogSchema,
    content: capabilityPlanContentSchema,
    reconciliation: capabilityReconciliationSchema.nullable(),
    createdAt: z.string().min(1),
    // Optional so artifacts persisted before revision lineage existed load.
    revisedFromArtifactId: z.string().min(1).optional(),
    revisionDecisionId: z.uuid().optional(),
  })
  .strict();

export type CapabilityResolution = z.infer<typeof capabilityResolutionSchema>;
export type CapabilityNeed = z.infer<typeof capabilityNeedSchema>;
export type CapabilityPlanContentShape = z.infer<
  typeof capabilityPlanContentShapeSchema
>;
export type CapabilityPlanContent = z.infer<typeof capabilityPlanContentSchema>;
export type CapabilityReconciliation = z.infer<
  typeof capabilityReconciliationSchema
>;
export type CapabilityPlanOutput = z.infer<typeof capabilityPlanOutputSchema>;
export type CapabilityCatalog = z.infer<typeof capabilityCatalogSchema>;
export type CapabilityPlan = z.infer<typeof capabilityPlanSchema>;

export interface CapabilityPlanValidation {
  passed: boolean;
  failures: string[];
}

export function validateCapabilityPlan(
  content: CapabilityPlanContentShape,
  plan: ArchitecturePlan,
  catalog: CapabilityCatalog,
): CapabilityPlanValidation {
  const failures: string[] = [];
  const agentIds = new Set(catalog.agents.map(({ id }) => id));
  const toolIds = new Set(catalog.tools.map(({ id }) => id));
  const sliceIds = new Set(
    plan.content.implementationSlices.map(({ id }) => id),
  );

  for (const need of content.needs) {
    if (need.resolution === "existing-agent" && need.capabilityId !== null) {
      if (!agentIds.has(need.capabilityId)) {
        failures.push(
          `Need ${need.id} cites unknown agent ${need.capabilityId}.`,
        );
      }
    }
    if (need.resolution === "existing-tool" && need.capabilityId !== null) {
      if (!toolIds.has(need.capabilityId)) {
        failures.push(`Need ${need.id} cites unknown tool ${need.capabilityId}.`);
      }
    }
  }

  const coveredSliceIds = new Set<string>();
  for (const element of [...content.needs, ...content.concerns]) {
    for (const sliceId of element.relatedSliceIds) {
      if (!sliceIds.has(sliceId)) {
        failures.push(
          `Capability element ${element.id} references unknown slice ${sliceId}.`,
        );
      }
    }
  }
  for (const need of content.needs) {
    for (const sliceId of need.relatedSliceIds) {
      if (sliceIds.has(sliceId)) coveredSliceIds.add(sliceId);
    }
  }
  for (const sliceId of sliceIds) {
    if (!coveredSliceIds.has(sliceId)) {
      failures.push(
        `Architecture slice ${sliceId} is not covered by any capability need.`,
      );
    }
  }

  return { passed: failures.length === 0, failures };
}
