import { describe, expect, it } from "vitest";
import { parseInspectPackageArgs } from "../src/cli/parseInspectPackageArgs.js";

describe("parseInspectPackageArgs", () => {
  it("uses root package defaults", () => {
    expect(parseInspectPackageArgs([])).toEqual({
      path: "package.json",
      maxBytes: 65_536,
    });
  });

  it("parses a workspace package path and byte limit", () => {
    expect(
      parseInspectPackageArgs([
        "--path",
        "packages/api/package.json",
        "--max-bytes",
        "4096",
      ]),
    ).toEqual({
      path: "packages/api/package.json",
      maxBytes: 4096,
    });
  });
});
