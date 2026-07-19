import { describe, expect, it } from "vitest";
import { getHarnessDefinition } from "../src/harnesses/harnessRegistry.js";

describe("getHarnessDefinition", () => {
  it("returns a registered harness", () => {
    const definition = getHarnessDefinition("technical-coach");

    expect(definition.id).toBe("technical-coach");
    expect(definition.evaluators).toHaveLength(4);
  });

  it("rejects an unknown harness", () => {
    expect(() => getHarnessDefinition("unknown")).toThrow(
      "Unknown harness: unknown",
    );
  });
  it("returns the basic reliability harness", () => {
    const definition = getHarnessDefinition("basic-reliability");
  
    expect(definition.id).toBe("basic-reliability");
    expect(definition.evaluators).toHaveLength(2);
  });
});