import { describe, expect, it } from "vitest";
import { parseInspectGitDiffArgs } from "../src/cli/parseInspectGitDiffArgs.js";

describe("parseInspectGitDiffArgs", () => {
  it("uses bounded working-tree defaults", () => {
    expect(parseInspectGitDiffArgs([])).toEqual({
      mode: "working-tree",
      contextLines: 3,
      maxBytes: 65_536,
    });
  });

  it("parses staged mode and numeric limits", () => {
    expect(
      parseInspectGitDiffArgs([
        "--mode",
        "staged",
        "--context-lines",
        "5",
        "--max-bytes",
        "4096",
      ]),
    ).toEqual({
      mode: "staged",
      contextLines: 5,
      maxBytes: 4096,
    });
  });

  it("rejects an unsupported mode", () => {
    expect(() =>
      parseInspectGitDiffArgs(["--mode", "head"]),
    ).toThrow("--mode must be working-tree or staged");
  });
});
