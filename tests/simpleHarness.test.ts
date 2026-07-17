import { describe, expect, it } from "vitest";
import { SimpleHarness } from "../src/harness/simpleHarness.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";

describe("SimpleHarness", () => {
  it("passes the task to the provider and returns the response", async () => {
    const provider = new FakeProvider("Harness response");
    const harness = new SimpleHarness(provider);

    const result = await harness.run("Analyze this task");

    expect(result).toBe("Harness response");
  });
});