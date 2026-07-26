import { describe, expect, it } from "vitest";
import { FakeProvider } from "../src/providers/fakeProvider.js";

describe("FakeProvider", () => {
  it("returns a provider result for a generation request", async () => {
    const provider = new FakeProvider("Test response");

    const result = await provider.generate({
      prompt: "Any prompt",
    });

    expect(result).toEqual({
      rawOutput: "Test response",
      parsedOutput: null,
      refusal: null,
    });
  });
});