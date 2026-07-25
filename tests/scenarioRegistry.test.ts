import { describe, expect, it } from "vitest";
import {
    findScenarioDefinition,
    getScenarioDefinition,
} from "../src/scenarios/scenarioRegistry.js";

describe("getScenarioDefinition", () => {
    it("returns a registered scenario", () => {
        const definition = getScenarioDefinition("explain-agentic-harness");

        expect(definition.id).toBe("explain-agentic-harness");
        expect(definition.evaluators).toHaveLength(1);
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
});