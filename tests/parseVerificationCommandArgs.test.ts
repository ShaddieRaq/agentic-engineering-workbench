import { describe, expect, it } from "vitest";
import { parseVerificationCommandArgs } from "../src/cli/parseVerificationCommandArgs.js";

describe("parseVerificationCommandArgs", () => {
  it("parses a fixed verification command", () => {
    expect(
      parseVerificationCommandArgs(["--command", "typecheck"]),
    ).toEqual({ command: "typecheck", maxOutputBytes: 65_536 });
  });

  it("parses a targeted test file and output bound", () => {
    expect(
      parseVerificationCommandArgs([
        "--command",
        "test-file",
        "--test-file",
        "tests/toolExecutor.test.ts",
        "--max-output-bytes",
        "4096",
      ]),
    ).toEqual({
      command: "test-file",
      testFile: "tests/toolExecutor.test.ts",
      maxOutputBytes: 4_096,
    });
  });

  it("rejects an arbitrary command", () => {
    expect(() =>
      parseVerificationCommandArgs(["--command", "echo secret"]),
    ).toThrow("--command must be typecheck, test, or test-file");
  });
});
