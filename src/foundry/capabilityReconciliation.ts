import type { ArchitecturePlan } from "./architecturePlan.js";
import {
  capabilityPlanOutputSchema,
  validateCapabilityPlan,
  type CapabilityCatalog,
  type CapabilityPlanContentShape,
  type CapabilityPlanOutput,
  type CapabilityReconciliation,
} from "./capabilityPlan.js";

// Drops dangling slice and need references with recorded evidence. Does NOT
// repair catalog capabilityIds or slice coverage: those must fail loudly.
export function reconcileCapabilityPlanContent(
  model: CapabilityPlanContentShape,
  plan: ArchitecturePlan,
  catalog: CapabilityCatalog,
): CapabilityPlanOutput {
  const content = structuredClone(model);
  const removedReferences: CapabilityReconciliation["removedReferences"] = [];
  const droppedNeedIds: CapabilityReconciliation["droppedNeedIds"] = [];

  const sliceIds = new Set(
    plan.content.implementationSlices.map(({ id }) => id),
  );

  content.needs = content.needs.filter((need) => {
    need.relatedSliceIds = need.relatedSliceIds.filter((sliceId) => {
      if (sliceIds.has(sliceId)) return true;
      removedReferences.push({
        context: "needs",
        ownerId: need.id,
        removedId: sliceId,
      });
      return false;
    });
    if (need.relatedSliceIds.length > 0) return true;
    droppedNeedIds.push(need.id);
    return false;
  });

  for (const concern of content.concerns) {
    concern.relatedSliceIds = concern.relatedSliceIds.filter((sliceId) => {
      if (sliceIds.has(sliceId)) return true;
      removedReferences.push({
        context: "concerns",
        ownerId: concern.id,
        removedId: sliceId,
      });
      return false;
    });
  }

  const needIds = new Set(content.needs.map(({ id }) => id));
  content.proposedCapabilities = content.proposedCapabilities.filter(
    (proposal) => {
      proposal.relatedNeedIds = proposal.relatedNeedIds.filter((needId) => {
        if (needIds.has(needId)) return true;
        removedReferences.push({
          context: "proposedCapabilities",
          ownerId: proposal.id,
          removedId: needId,
        });
        return false;
      });
      return proposal.relatedNeedIds.length > 0;
    },
  );

  const validation = validateCapabilityPlan(content, plan, catalog);
  if (!validation.passed) {
    throw new Error(
      `Capability plan does not satisfy the architecture plan: ${validation.failures.join(" ")}`,
    );
  }

  const repaired =
    removedReferences.length > 0 || droppedNeedIds.length > 0;

  return capabilityPlanOutputSchema.parse({
    ...content,
    reconciliation: repaired ? { removedReferences, droppedNeedIds } : null,
  });
}
