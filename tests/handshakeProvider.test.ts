import { describe, expect, it } from "vitest";
import type { AIProvider, AIProviderResult } from "../src/providers/aiProvider.js";
import { createHandshakeProvider } from "../src/providers/handshakeProvider.js";

function fakeProvider(
  impl: () => Promise<AIProviderResult<unknown>>,
): AIProvider {
  return { generate: impl as AIProvider["generate"] };
}

const answer: AIProviderResult<unknown> = {
  rawOutput: "x",
  parsedOutput: null,
  refusal: null,
  provider: { model: "m", usage: null },
};

describe("risk-linter handshake provider", () => {
  it("counts model requests and refuses the (cap+1)th before any request is made", async () => {
    let calls = 0;
    const h = createHandshakeProvider(
      fakeProvider(async () => {
        calls += 1;
        return answer;
      }),
      { requestId: "rid-1", maxModelRequests: 1, maxRetries: 0 },
    );
    await h.provider.generate({ prompt: "a" });
    await expect(h.provider.generate({ prompt: "b" })).rejects.toThrow(
      /model request cap 1 reached for admitted request rid-1/,
    );
    expect(calls).toBe(1);
    expect(h.state).toMatchObject({
      requestId: "rid-1",
      modelRequests: 1,
      maxModelRequests: 1,
      maxRetries: 0,
      providerError: null,
    });
  });

  it("records the provider error's status/code/type and rethrows it unchanged", async () => {
    const err = Object.assign(new Error("429 You exceeded your current quota"), {
      status: 429,
      code: "insufficient_quota",
      type: "insufficient_quota",
    });
    const h = createHandshakeProvider(
      fakeProvider(async () => {
        throw err;
      }),
      { requestId: "rid-2", maxModelRequests: 1, maxRetries: 0 },
    );
    await expect(h.provider.generate({ prompt: "a" })).rejects.toBe(err);
    expect(h.state.modelRequests).toBe(1);
    expect(h.state.providerError).toEqual({
      name: "Error",
      status: 429,
      code: "insufficient_quota",
      type: "insufficient_quota",
      message: "429 You exceeded your current quota",
    });
  });

  it("is uncapped when no handshake is in force", async () => {
    const h = createHandshakeProvider(fakeProvider(async () => answer), {
      requestId: null,
      maxModelRequests: null,
      maxRetries: 0,
    });
    await h.provider.generate({ prompt: "a" });
    await h.provider.generate({ prompt: "b" });
    expect(h.state.modelRequests).toBe(2);
  });
});
