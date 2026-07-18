import { describe, expect, it } from "vitest";
import { getFileId } from "../src/cli/getFileId.js";

describe("getFileId", () => {
  it("returns the filename without its extension", () => {
    expect(getFileId("roles/technical-coach.md")).toBe(
      "technical-coach",
    );

    expect(getFileId("scenarios/connection-check.md")).toBe(
      "connection-check",
    );
  });
});