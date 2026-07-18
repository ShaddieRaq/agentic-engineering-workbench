import { describe, expect, it } from "vitest";
import { SimpleHarness } from "../src/harness/simpleHarness.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";

describe("SimpleHarness", () => {
  it("returns the task and provider response", async () => {
    const provider = new FakeProvider("Harness response");
    const harness = new SimpleHarness(provider);

    const result = await harness.run("Analyze this task");

    expect(result.task).toBe("Analyze this task");
    expect(result.output).toBe("Harness response");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.completedAt).toString()).not.toBe("Invalid Date");
  });
});