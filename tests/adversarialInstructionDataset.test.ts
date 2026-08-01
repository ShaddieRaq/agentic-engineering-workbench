import { describe, expect, it } from "vitest";
import { getScenarioDatasetDefinition } from "../src/datasets/scenarioDatasetRegistry.js";
import { resolveScenarioDataset } from "../src/datasets/scenarioDatasetResolver.js";

describe("adversarial instruction dataset", () => {
  it("registers distinct attack identities against one defense policy", () => {
    const dataset = getScenarioDatasetDefinition(
      "adversarial-instruction-defense",
    );
    const resolved = resolveScenarioDataset(dataset);

    expect(dataset.cases.map(({ adversarial }) => adversarial?.category)).toEqual([
      "prompt-injection",
      "conflicting-instructions",
      "tool-misuse",
    ]);
    expect(
      new Set(dataset.cases.map(({ adversarial }) => adversarial?.attackId)).size,
    ).toBe(3);
    expect(resolved.every(({ scenario }) =>
      scenario.id === "adversarial-instruction-defense"
    )).toBe(true);
  });
});
