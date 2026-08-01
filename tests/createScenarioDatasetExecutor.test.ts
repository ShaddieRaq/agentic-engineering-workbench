import { describe, expect, it } from "vitest";
import { createScenarioDatasetExecutor } from "../src/datasets/createScenarioDatasetExecutor.js";
import { getScenarioDatasetDefinition } from "../src/datasets/scenarioDatasetRegistry.js";
import { resolveScenarioDataset } from "../src/datasets/scenarioDatasetResolver.js";
import { getHarnessDefinition } from "../src/harnesses/harnessRegistry.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";

describe("createScenarioDatasetExecutor", () => {
  it("executes a resolved case through SimpleHarness", async () => {
    const rawOutput = JSON.stringify({
      definition: "An agentic harness controls an AI system run.",
      responsibilities: ["Build prompts", "Evaluate output"],
      modelBoundary: "The model generates output inside the harness.",
      practicalExample: "Run one support request and record evidence.",
    });
    const dataset = getScenarioDatasetDefinition(
      "agentic-harness-audiences",
    );
    const resolvedCase = resolveScenarioDataset(dataset)[0]!;
    const executor = createScenarioDatasetExecutor({
      provider: new FakeProvider(rawOutput),
      role: {
        id: "technical-coach",
        instructions: "Explain technical concepts clearly.",
      },
      harnessDefinition: getHarnessDefinition(
        "basic-reliability",
      ),
    });

    const result = await executor(resolvedCase);

    expect(result.scenarioId).toBe("explain-agentic-harness");
    expect(result.task.id).toBe("beginner-explanation");
    expect(result.context).toEqual(
      resolvedCase.datasetCase.context,
    );
    expect(result.output).toBe(rawOutput);
    expect(result.passed).toBe(true);
  });
});
