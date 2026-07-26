import { describe, expect, it } from "vitest";
import {
    findScenarioDefinition,
    getScenarioDefinition,
} from "../src/scenarios/scenarioRegistry.js";
import { explainAgenticHarnessOutputSchema } from "../src/scenarios/explainAgenticHarnessOutput.js";

describe("getScenarioDefinition", () => {
    it("returns a registered scenario", () => {
        const definition = getScenarioDefinition("explain-agentic-harness");

        expect(definition.id).toBe("explain-agentic-harness");
        expect(definition.evaluators).toHaveLength(2);
        expect(
            definition.evaluators.map((evaluator) => evaluator.id),
        ).toEqual([
            "required-phrase",
            "structured-output",
        ]);
    });

    it("rejects an unknown scenario", () => {
        expect(() => getScenarioDefinition("unknown")).toThrow(
            "Unknown scenario: unknown",
        );
    });
    it("returns undefined when no scenario is registered", () => {
        expect(findScenarioDefinition("connection-check")).toBeUndefined();
    });
    it("returns a registered scenario when one exists", () => {
        const definition = findScenarioDefinition("explain-agentic-harness");

        expect(definition?.id).toBe("explain-agentic-harness");
    });
    it("exposes the scenario output contract", () => {
        const definition = getScenarioDefinition("explain-agentic-harness");

        expect(definition.outputSchema).toBe(explainAgenticHarnessOutputSchema);
    });
});
