import type { FoundryArtifactStore } from "./foundryArtifactStore.js";

// Standing advisories (roadmap priority A): advisory concerns recorded on
// APPROVED artifacts are the system's own predictions of future defects —
// the Mac Librarian production gaps were each flagged this way and read
// exactly once. This module makes them project state: aggregated across
// every approved plan, capability plan, and test suite of every
// generation, deduplicated by normalized text, so they can be displayed
// and injected into reopened interviews until a criterion resolves them.

export interface StandingAdvisory {
  stage: "architect" | "capability" | "test-designer";
  description: string;
  firstRecordedAt: string;
  occurrences: number;
  sourceArtifactId: string;
}

function normalize(description: string): string {
  return description
    .toLowerCase()
    .replace(/^advisory( concern)?:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface DecisionLike {
  decision: string;
  decidedAt: string;
}

function latestIsApprove(decisions: DecisionLike[]): boolean {
  const latest = [...decisions].sort((left, right) =>
    right.decidedAt.localeCompare(left.decidedAt),
  )[0];
  return latest?.decision === "approve";
}

export async function collectStandingAdvisories(
  store: FoundryArtifactStore,
  briefId: string,
): Promise<StandingAdvisory[]> {
  const collected = new Map<string, StandingAdvisory>();

  function add(
    stage: StandingAdvisory["stage"],
    description: string,
    createdAt: string,
    sourceArtifactId: string,
  ): void {
    const key = normalize(description);
    const existing = collected.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (createdAt.localeCompare(existing.firstRecordedAt) < 0) {
        existing.firstRecordedAt = createdAt;
        existing.sourceArtifactId = sourceArtifactId;
        existing.description = description;
      }
    } else {
      collected.set(key, {
        stage,
        description,
        firstRecordedAt: createdAt,
        occurrences: 1,
        sourceArtifactId,
      });
    }
  }

  const stages = [
    {
      stage: "architect" as const,
      artifactKind: "architecture-plan" as const,
      decisionKind: "architecture-plan-decision" as const,
      idOf: (artifact: { planId: string }) => artifact.planId,
      decisionTargets: (decision: { planId: string }) => decision.planId,
    },
    {
      stage: "capability" as const,
      artifactKind: "capability-plan" as const,
      decisionKind: "capability-plan-decision" as const,
      idOf: (artifact: { capabilityPlanId: string }) =>
        artifact.capabilityPlanId,
      decisionTargets: (decision: { capabilityPlanId: string }) =>
        decision.capabilityPlanId,
    },
    {
      stage: "test-designer" as const,
      artifactKind: "test-suite" as const,
      decisionKind: "test-suite-decision" as const,
      idOf: (artifact: { testSuiteId: string }) => artifact.testSuiteId,
      decisionTargets: (decision: { testSuiteId: string }) =>
        decision.testSuiteId,
    },
  ];

  for (const definition of stages) {
    const { artifacts } = await store.list({
      kind: definition.artifactKind,
      briefId,
      limit: 500,
    });
    const { artifacts: decisionSummaries } = await store.list({
      kind: definition.decisionKind,
      briefId,
      limit: 500,
    });
    const decisionsByTarget = new Map<string, DecisionLike[]>();
    for (const summary of decisionSummaries) {
      const stored = await store.load(summary.id);
      if (stored.kind !== definition.decisionKind) continue;
      const artifact = stored.artifact as unknown as {
        decision: string;
        decidedAt: string;
      };
      const target = definition.decisionTargets(
        stored.artifact as never,
      );
      const bucket = decisionsByTarget.get(target) ?? [];
      bucket.push({ decision: artifact.decision, decidedAt: artifact.decidedAt });
      decisionsByTarget.set(target, bucket);
    }

    for (const summary of artifacts) {
      const stored = await store.load(summary.id);
      if (stored.kind !== definition.artifactKind) continue;
      const id = definition.idOf(stored.artifact as never);
      if (!latestIsApprove(decisionsByTarget.get(id) ?? [])) continue;
      const content = (stored.artifact as unknown as {
        content: {
          concerns: { severity: string; description: string }[];
        };
        createdAt: string;
      });
      for (const concern of content.content.concerns) {
        if (concern.severity !== "advisory") continue;
        add(definition.stage, concern.description, content.createdAt, id);
      }
    }
  }

  return [...collected.values()].sort(
    (left, right) =>
      right.occurrences - left.occurrences ||
      left.firstRecordedAt.localeCompare(right.firstRecordedAt),
  );
}
