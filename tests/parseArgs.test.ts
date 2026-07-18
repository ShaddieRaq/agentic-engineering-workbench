import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/parseArgs.js";

describe("parseArgs", () => {
  it("returns the role and task paths", () => {
    const result = parseArgs([
      "--role",
      "roles/technical-coach.md",
      "--task",
      "scenarios/connection-check.md",
    ]);

    expect(result).toEqual({
      rolePath: "roles/technical-coach.md",
      taskPath: "scenarios/connection-check.md",
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
});