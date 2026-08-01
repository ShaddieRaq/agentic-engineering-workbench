import {
    describe,
    expect,
    expectTypeOf,
    it,
  } from "vitest";
  import { z } from "zod";
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
      provider: {
        model: "fake",
        usage: null,
      },
    });
  });
  it("preserves the schema output type in the provider result", async () => {
    const provider = new FakeProvider("Structured response");

    const result = await provider.generate({
      prompt: "Return a structured response.",
      outputSchema: z.object({
        answer: z.string(),
      }),
    });

    expectTypeOf(result.parsedOutput).toEqualTypeOf<
      { answer: string } | null
    >();
  });
});
