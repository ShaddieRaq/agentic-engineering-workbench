import { describe, expect, it } from "vitest";
import { parseSearchTextArgs } from "../src/cli/parseSearchTextArgs.js";

describe("parseSearchTextArgs", () => {
  it("parses a query with safe defaults", () => {
    expect(
      parseSearchTextArgs(["--query", "agentic harness"]),
    ).toEqual({
      query: "agentic harness",
      path: ".",
      caseSensitive: false,
      maxMatches: 50,
    });
  });

  it("parses search controls", () => {
    expect(
      parseSearchTextArgs([
        "--query",
        "HarnessResult",
        "--path",
        "src",
        "--case-sensitive",
        "--max-matches",
        "20",
      ]),
    ).toEqual({
      query: "HarnessResult",
      path: "src",
      caseSensitive: true,
      maxMatches: 20,
    });
  });

  it("rejects a missing query", () => {
    expect(() => parseSearchTextArgs([])).toThrow(
      "Missing required --query argument",
    );
  });
});
