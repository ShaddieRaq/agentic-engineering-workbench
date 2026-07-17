import { describe, expect, it } from "vitest";
import { FakeProvider } from "../src/providers/fakeProvider.js";

describe("FakeProvider", () => {
  it("returns the configured response", async () => {
    const provider = new FakeProvider("Test response");

    const result = await provider.generateText("Any prompt");

    expect(result).toBe("Test response");
  });
});