import { describe, expect, it } from "vitest";
import { parseRepositoryAnalysisArgs } from "../src/cli/parseRepositoryAnalysisArgs.js";

describe("parseRepositoryAnalysisArgs", () => {
  it("defaults to the economical repository-analysis model", () => {
    expect(parseRepositoryAnalysisArgs([])).toEqual({
      model: "gpt-5.4-mini",
    });
  });

  it("parses an explicit model and analysis instruction", () => {
    expect(
      parseRepositoryAnalysisArgs([
        "--model",
        "gpt-5.4",
        "--instruction",
        "Review the repository architecture.",
      ]),
    ).toEqual({
      model: "gpt-5.4",
      instruction: "Review the repository architecture.",
    });
  });
});
