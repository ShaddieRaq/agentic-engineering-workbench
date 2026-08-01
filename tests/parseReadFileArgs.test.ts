import { describe, expect, it } from "vitest";
import { parseReadFileArgs } from "../src/cli/parseReadFileArgs.js";

describe("parseReadFileArgs", () => {
  it("parses a path with the default byte limit", () => {
    expect(parseReadFileArgs(["--path", "README.md"])).toEqual({
      path: "README.md",
      maxBytes: 32_768,
    });
  });

  it("parses an explicit byte limit", () => {
    expect(
      parseReadFileArgs([
        "--path",
        "src/index.ts",
        "--max-bytes",
        "4096",
      ]),
    ).toEqual({
      path: "src/index.ts",
      maxBytes: 4096,
    });
  });

  it("rejects a missing path", () => {
    expect(() => parseReadFileArgs([])).toThrow(
      "Missing required --path argument",
    );
  });
});
