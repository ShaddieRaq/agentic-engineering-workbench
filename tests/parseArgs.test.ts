import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/parseArgs.js";

describe("parseArgs", () => {
  it("returns the role and task paths", () => {
    const result = parseArgs([
        "--role",
        "roles/technical-coach.md",
        "--task",
        "scenarios/connection-check.md",
        "--context",
        "README.md",
        "--context",
        "docs/architecture.md",
      ]);

      expect(result).toEqual({
        rolePath: "roles/technical-coach.md",
        taskPath: "scenarios/connection-check.md",
        contextPaths: ["README.md", "docs/architecture.md"],
        harnessId: "technical-coach",
      });
  });

  it("rejects a missing role argument", () => {
    expect(() =>
      parseArgs([
        "--task",
        "scenarios/connection-check.md",
      ]),
    ).toThrow("Missing required --role argument");
  });

  it("rejects a missing task argument", () => {
    expect(() =>
      parseArgs([
        "--role",
        "roles/technical-coach.md",
      ]),
    ).toThrow("Missing required --task argument");
  });
  it("returns an empty context list when none are provided", () => {
    const result = parseArgs([
      "--role",
      "roles/technical-coach.md",
      "--task",
      "scenarios/connection-check.md",
    ]);
  
    expect(result.contextPaths).toEqual([]);
  });
  it("parses a harness id", () => {
    const result = parseArgs([
      "--harness",
      "technical-coach",
      "--role",
      "roles/technical-coach.md",
      "--task",
      "scenarios/explain-agentic-harness.md",
    ]);
  
    expect(result.harnessId).toBe("technical-coach");
  });
});