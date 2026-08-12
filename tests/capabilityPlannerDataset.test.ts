import { describe, expect, it } from "vitest";
import { agentDatasetDefinitionSchema } from "../src/agents/datasets/agentDatasetDefinition.js";
import { getAgentDatasetDefinition } from "../src/agents/datasets/agentDatasetRegistry.js";
import { capabilityPlannerDataset } from "../src/agents/datasets/capabilityPlannerDataset.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { capabilityPlannerInputSchema } from "../src/agents/capabilityPlanner/capabilityPlannerAgent.js";
import {
  assessCapabilityPlannerExpectation,
  capabilityPlannerExpectationSchema,
} from "../src/agents/capabilityPlanner/capabilityPlannerExpectation.js";
import type { CapabilityPlanOutput } from "../src/foundry/capabilityPlan.js";

function output(overrides: {
  resolutions?: { resolution: string; capabilityId?: string | null }[];
  proposals?: number;
  blocking?: number;
}): CapabilityPlanOutput {
  return {
    needs: (overrides.resolutions ?? []).map((entry, index) => ({
      id: `need-${index}`,
      resolution: entry.resolution,
      capabilityId: entry.capabilityId ?? null,
    })),
    proposedCapabilities: Array.from({ length: overrides.proposals ?? 0 }, (_, i) => ({
      id: `cap-${i}`,
    })),
    concerns: Array.from({ length: overrides.blocking ?? 0 }, (_, i) => ({
      id: `concern-${i}`,
      severity: "blocking",
    })),
    reconciliation: null,
  } as unknown as CapabilityPlanOutput;
}

describe("capabilityPlannerDataset", () => {
  it("is a valid development dataset with stable case ids", () => {
    const parsed = agentDatasetDefinitionSchema.parse(capabilityPlannerDataset);
    expect(parsed.agentId).toBe("capability-planner");
    expect(parsed.purpose).toBe("development");
    expect(parsed.cases.map(({ id }) => id)).toEqual([
      "feasible-plan-fabricates-nothing",
      "ordinary-work-stays-project-code",
      "novel-need-stays-feasible-without-hallucinated-reuse",
      "mixed-plan-keeps-ordinary-work-as-project-code",
    ]);
  });

  it("has runnable inputs and parsable hidden expectations on every case", () => {
    for (const datasetCase of capabilityPlannerDataset.cases) {
      expect(() =>
        capabilityPlannerInputSchema.parse(datasetCase.input),
      ).not.toThrow();
      expect(datasetCase.expected).toBeDefined();
      expect(() =>
        capabilityPlannerExpectationSchema.parse(datasetCase.expected),
      ).not.toThrow();
    }
  });

  it("is registered and wired into the agent verification manifest", () => {
    expect(getAgentDatasetDefinition("capability-planner-smoke").id).toBe(
      "capability-planner-smoke",
    );
    expect(
      platformAgentRegistry.get("capability-planner").manifest.verification,
    ).toEqual({
      datasetIds: ["capability-planner-smoke"],
      minimumPassRate: null,
    });
  });

  it("holds the project-code discipline and catches over-engineering", () => {
    const projectCode = capabilityPlannerDataset.cases[1]!.expected;
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }] }),
        projectCode,
      ).passed,
    ).toBe(true);
    // A proposal the empty-catalog plan does not need trips maxProposedCapabilities: 0.
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }], proposals: 1 }),
        projectCode,
      ).passed,
    ).toBe(false);
  });

  it("gates the unambiguous floor without asserting the reuse-vs-build call", () => {
    // Feasible plan: reuse OR project-code both pass; a fabricated capability or
    // a false blocking concern fails.
    const feasible = capabilityPlannerDataset.cases[0]!.expected;
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "existing-agent", capabilityId: "x" }] }),
        feasible,
      ).passed,
    ).toBe(true);
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }], proposals: 1 }),
        feasible,
      ).passed,
    ).toBe(false);
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }], blocking: 1 }),
        feasible,
      ).passed,
    ).toBe(false);

    // Novel-need case: anything but hallucinated existing-agent reuse passes.
    const novel = capabilityPlannerDataset.cases[2]!.expected;
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "engineering-change-required" }] }),
        novel,
      ).passed,
    ).toBe(true);
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "existing-agent", capabilityId: "x" }] }),
        novel,
      ).passed,
    ).toBe(false);

    // Mixed case: at least one need must be ordinary project-code.
    const mixed = capabilityPlannerDataset.cases[3]!.expected;
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }] }),
        mixed,
      ).passed,
    ).toBe(true);
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "engineering-change-required" }] }),
        mixed,
      ).passed,
    ).toBe(false);
  });
});
