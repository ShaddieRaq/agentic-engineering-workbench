import { describe, expect, it } from "vitest";
import { scenarioSuiteDefinitionSchema } from "../src/suites/scenarioSuiteDefinition.js";

describe("scenarioSuiteDefinitionSchema", () => {
    it("accepts a suite containing scenario IDs", () => {
        const result = scenarioSuiteDefinitionSchema.parse({
            id: "core-reliability",
            description: "Core reliability scenarios.",
            scenarioIds: [
                "explain-agentic-harness",
            ],
        });

        expect(result.scenarioIds).toEqual([
            "explain-agentic-harness",
        ]);
    });
    it("rejects a suite with no scenarios", () => {
        expect(() =>
          scenarioSuiteDefinitionSchema.parse({
            id: "empty-suite",
            description: "Contains no scenarios.",
            scenarioIds: [],
          }),
        ).toThrow();
      });
      it("rejects duplicate scenario IDs", () => {
        const result = scenarioSuiteDefinitionSchema.safeParse({
          id: "duplicate-suite",
          description: "Contains duplicate scenarios.",
          scenarioIds: [
            "explain-agentic-harness",
            "explain-agentic-harness",
          ],
        });
    
        expect(result.success).toBe(false);
      });
});