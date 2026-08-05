import {
  architectPlanOutputSchema,
  validatePlanAgainstBrief,
  type ArchitectPlanOutput,
  type ArchitecturePlanContentShape,
  type ArchitectureReconciliation,
} from "./architecturePlan.js";
import type { ProjectBrief } from "./projectBrief.js";

// Drops dangling brief-entry and internal dependency references with recorded
// evidence. Deliberately does NOT repair acceptance-criterion references:
// coverage correctness must fail loudly rather than be papered over.
export function reconcileArchitecturePlanContent(
  model: ArchitecturePlanContentShape,
  brief: ProjectBrief,
): ArchitectPlanOutput {
  const content = structuredClone(model);
  const removedReferences: ArchitectureReconciliation["removedReferences"] = [];

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

  for (const [contextName, section] of [
    ["decisions", content.decisions],
    ["concerns", content.concerns],
  ] as const) {
    for (const element of section) {
      element.relatedBriefEntryIds = element.relatedBriefEntryIds.filter(
        (relatedId) => {
          if (entryIds.has(relatedId)) return true;
          removedReferences.push({
            context: contextName,
            ownerId: element.id,
            removedId: relatedId,
          });
          return false;
        },
      );
    }
  }

  const componentIds = new Set(content.components.map(({ id }) => id));
  for (const component of content.components) {
    component.dependsOnComponentIds = component.dependsOnComponentIds.filter(
      (dependencyId) => {
        if (componentIds.has(dependencyId) && dependencyId !== component.id) {
          return true;
        }
        removedReferences.push({
          context: "components",
          ownerId: component.id,
          removedId: dependencyId,
        });
        return false;
      },
    );
  }

  const sliceIds = new Set(content.implementationSlices.map(({ id }) => id));
  for (const slice of content.implementationSlices) {
    slice.dependsOnSliceIds = slice.dependsOnSliceIds.filter((dependencyId) => {
      if (sliceIds.has(dependencyId) && dependencyId !== slice.id) return true;
      removedReferences.push({
        context: "implementationSlices",
        ownerId: slice.id,
        removedId: dependencyId,
      });
      return false;
    });
  }

  const validation = validatePlanAgainstBrief(content, brief);
  if (!validation.passed) {
    throw new Error(
      `Architecture plan does not satisfy the brief: ${validation.failures.join(" ")}`,
    );
  }

  return architectPlanOutputSchema.parse({
    ...content,
    reconciliation:
      removedReferences.length > 0 ? { removedReferences } : null,
  });
}
