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
      "reuses-an-existing-catalog-agent",
      "ordinary-work-stays-project-code",
      "recognizes-a-capability-gap",
      "mixed-plan-keeps-buckets-separate",
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

  it("passes an all-project-code plan and fails a fabricated proposal", () => {
    const expected = capabilityPlannerDataset.cases[1]!.expected;
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }] }),
        expected,
      ).passed,
    ).toBe(true);
    // A proposal the plan does not need trips maxProposedCapabilities: 0.
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }], proposals: 1 }),
        expected,
      ).passed,
    ).toBe(false);
  });

  it("requires a proposal for a genuine gap and a reused resolution for reuse", () => {
    const gapExpected = capabilityPlannerDataset.cases[2]!.expected;
    expect(
      assessCapabilityPlannerExpectation(output({ proposals: 0 }), gapExpected).passed,
    ).toBe(false);
    expect(
      assessCapabilityPlannerExpectation(output({ proposals: 1 }), gapExpected).passed,
    ).toBe(true);

    const reuseExpected = capabilityPlannerDataset.cases[0]!.expected;
    // Reinventing it as project-code misses the existing-agent reuse.
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "project-code" }] }),
        reuseExpected,
      ).passed,
    ).toBe(false);
    expect(
      assessCapabilityPlannerExpectation(
        output({ resolutions: [{ resolution: "existing-agent", capabilityId: "project-intake" }] }),
        reuseExpected,
      ).passed,
    ).toBe(true);
  });
});
