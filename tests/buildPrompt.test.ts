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
  it("includes provided context", () => {
    const role = {
      id: "technical-coach",
      instructions: "Explain concepts clearly and practically.",
    };
  
    const task = {
      id: "explain-harness",
      instruction: "Explain what an agentic harness is.",
    };
  
    const context = [
      {
        id: "project-readme",
        source: "README.md",
        content: "This project is an agentic engineering workbench.",
      },
    ];
  
    const prompt = buildPrompt(role, task, context);
  
    expect(prompt).toContain("Source: README.md");
    expect(prompt).toContain(
      "This project is an agentic engineering workbench.",
    );
  });
});