import { describe, expect, it } from "vitest";
import { requireInteractiveTerminal } from "../src/cli/interactiveGuard.js";

describe("requireInteractiveTerminal", () => {
  it("passes when both streams are TTYs", () => {
    expect(() =>
      requireInteractiveTerminal("submission-decide", { isTTY: true }, { isTTY: true }),
    ).not.toThrow();
  });

  it("refuses scripted invocation (incident 2026-08-08)", () => {
    expect(() =>
      requireInteractiveTerminal("submission-decide", { isTTY: undefined }, { isTTY: true }),
    ).toThrow(/interactive terminal/);
    expect(() =>
      requireInteractiveTerminal("record-completion", { isTTY: true }, { isTTY: false }),
    ).toThrow(/forged/);
  });
});
