import type { HarnessDefinition } from "../harness/harnessDefinition.js";
import { technicalCoachHarness } from "./technicalCoachHarness.js";
import { basicReliabilityHarness } from "./basicReliabilityHarness.js";

const harnesses: Record<string, HarnessDefinition> = {
  [technicalCoachHarness.id]: technicalCoachHarness,
  [basicReliabilityHarness.id]: basicReliabilityHarness,
};

export function getHarnessDefinition(id: string): HarnessDefinition {
  const definition = harnesses[id];

  if (!definition) {
    throw new Error(`Unknown harness: ${id}`);
  }

  return definition;
}