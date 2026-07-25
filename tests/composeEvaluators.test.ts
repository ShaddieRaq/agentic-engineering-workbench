import { describe, expect, it } from "vitest";
import { composeEvaluators } from "../src/evaluations/composeEvaluators.js";
import { basicReliabilityHarness } from "../src/harnesses/basicReliabilityHarness.js";
import { explainAgenticHarnessScenario } from "../src/scenarios/explainAgenticHarnessScenario.js";

describe("composeEvaluators", () => {
    it("uses only harness evaluators when no scenario exists", () => {
        const evaluators = composeEvaluators(basicReliabilityHarness);

        expect(evaluators).toEqual(basicReliabilityHarness.evaluators);
    });
    it("appends scenario evaluators after harness evaluators", () => {
        const evaluators = composeEvaluators(
            basicReliabilityHarness,
            explainAgenticHarnessScenario,
        );

        expect(evaluators).toEqual([
            ...basicReliabilityHarness.evaluators,
            ...explainAgenticHarnessScenario.evaluators,
        ]);
    });
});