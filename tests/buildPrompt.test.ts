import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/harness/buildPrompt.js";

describe("buildPrompt", () => {
  it("combines role instructions with the task", () => {
    const role = {
      id: "technical-coach",
      instructions: "Explain concepts clearly and practically.",
    };

    const task = {
      id: "explain-harness",
      instruction: "Explain what an agentic harness is.",
    };

    const prompt = buildPrompt(role, task);

    expect(prompt).toContain("Explain concepts clearly and practically.");
    expect(prompt).toContain("Explain what an agentic harness is.");
  });
});