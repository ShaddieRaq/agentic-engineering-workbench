import { describe, expect, it } from "vitest";
import { parseWorkspaceArgs } from "../src/cli/parseWorkspaceArgs.js";

describe("parseWorkspaceArgs", () => {
  it("parses workspace management commands", () => {
    expect(parseWorkspaceArgs(["list"])).toEqual({ command: "list" });
    expect(parseWorkspaceArgs(["add", "../project", "--id", "project", "--name", "Project"])).toEqual({
      command: "add",
      rootPath: "../project",
      id: "project",
      name: "Project",
    });
    expect(parseWorkspaceArgs(["remove", "project"])).toEqual({ command: "remove", id: "project" });
  });

  it("rejects incomplete commands", () => {
    expect(() => parseWorkspaceArgs([])).toThrow("Expected one of");
    expect(() => parseWorkspaceArgs(["add", "../project", "--id"])).toThrow("--id value");
  });
});
