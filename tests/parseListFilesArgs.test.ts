import { describe, expect, it } from "vitest";
import { parseListFilesArgs } from "../src/cli/parseListFilesArgs.js";

describe("parseListFilesArgs", () => {
  it("uses safe defaults", () => {
    expect(parseListFilesArgs([])).toEqual({
      path: ".",
      maxEntries: 50,
    });
  });

  it("parses a relative path and output limit", () => {
    expect(
      parseListFilesArgs([
        "--path",
        "src",
        "--max-entries",
        "20",
      ]),
    ).toEqual({
      path: "src",
      maxEntries: 20,
    });
  });
});
