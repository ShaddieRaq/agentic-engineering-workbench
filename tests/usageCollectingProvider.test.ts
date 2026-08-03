import { describe, expect, it } from "vitest";
import { FakeProvider } from "../src/providers/fakeProvider.js";
import { createUsageCollectingProvider } from "../src/providers/usageCollectingProvider.js";

describe("createUsageCollectingProvider", () => {
  it("aggregates complete usage across provider calls", async () => {
    const collecting = createUsageCollectingProvider(
      new FakeProvider("unused", {
        model: "gpt-5.4-mini",
        usage: {
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 4,
          reasoningTokens: 1,
          totalTokens: 15,
        },
      }),
    );

    await collecting.provider.generate({ prompt: "one" });
    await collecting.provider.generate({ prompt: "two" });

    expect(collecting.evidence("fallback")).toEqual({
      model: "gpt-5.4-mini",
      usage: {
        inputTokens: 20,
        cachedInputTokens: 4,
        outputTokens: 8,
        reasoningTokens: 2,
        totalTokens: 30,
      },
    });
  });

  it("marks incomplete usage when any sample lacks tokens", async () => {
    let call = 0;
    const collecting = createUsageCollectingProvider({
      async generate() {
        call += 1;
        return {
          rawOutput: "ok",
          parsedOutput: null,
          refusal: null,
          provider: {
            model: "gpt-5.4-mini",
            usage: call === 1
              ? {
                inputTokens: 10,
                cachedInputTokens: 0,
                outputTokens: 2,
                reasoningTokens: 0,
                totalTokens: 12,
              }
              : null,
          },
        };
      },
    });

    await collecting.provider.generate({ prompt: "one" });
    await collecting.provider.generate({ prompt: "two" });

    expect(collecting.evidence("fallback")).toEqual({
      model: "gpt-5.4-mini",
      usage: null,
    });
  });

  it("omits evidence when the provider was never called", () => {
    const collecting = createUsageCollectingProvider(new FakeProvider("unused"));
    expect(collecting.evidence("fallback")).toBeUndefined();
  });
});
