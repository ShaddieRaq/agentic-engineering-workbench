import { describe, expect, it } from "vitest";
import { agentDatasetDefinitionSchema } from "../src/agents/datasets/agentDatasetDefinition.js";

describe("agentDatasetDefinitionSchema", () => {
  it("accepts JSON inputs for one registered agent", () => {
    expect(
      agentDatasetDefinitionSchema.parse({
        id: "test-dataset",
        description: "Test cases.",
        agentId: "test-agent",
        cases: [{ id: "case-1", input: { instruction: "Test." } }],
      }),
    ).toMatchObject({ id: "test-dataset", agentId: "test-agent" });
  });

  it("rejects duplicate case IDs", () => {
    const result = agentDatasetDefinitionSchema.safeParse({
      id: "test-dataset",
      description: "Test cases.",
      agentId: "test-agent",
      cases: [
        { id: "same", input: {} },
        { id: "same", input: {} },
      ],
    });

    expect(result.success).toBe(false);
  });
});
