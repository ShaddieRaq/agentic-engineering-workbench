import { describe, expect, it } from "vitest";
import { parseFoundryArgs } from "../src/cli/parseFoundryArgs.js";

describe("parseFoundryArgs", () => {
  it("parses brief-create", () => {
    expect(
      parseFoundryArgs(["brief-create", "--title", "Planner", "--idea", "Meals"]),
    ).toEqual({ command: "brief-create", title: "Planner", idea: "Meals" });
  });

  it("parses brief-show with and without a version", () => {
    expect(parseFoundryArgs(["brief-show", "--brief-id", "abc"])).toEqual({
      command: "brief-show",
      briefId: "abc",
      version: null,
    });
    expect(
      parseFoundryArgs(["brief-show", "--brief-id", "abc", "--version", "2"]),
    ).toEqual({ command: "brief-show", briefId: "abc", version: 2 });
  });

  it("parses brief-list with an optional brief ID", () => {
    expect(parseFoundryArgs(["brief-list"])).toEqual({
      command: "brief-list",
      briefId: null,
    });
    expect(parseFoundryArgs(["brief-list", "--brief-id", "abc"])).toEqual({
      command: "brief-list",
      briefId: "abc",
    });
  });

  it("parses brief-lineage", () => {
    expect(parseFoundryArgs(["brief-lineage", "--brief-id", "abc"])).toEqual({
      command: "brief-lineage",
      briefId: "abc",
    });
  });

  it("parses brief-decide with repeated revisions", () => {
    expect(
      parseFoundryArgs([
        "brief-decide",
        "--brief-id",
        "abc",
        "--version",
        "1",
        "--decision",
        "revise",
        "--operator",
        "op-1",
        "--rationale",
        "Needs work",
        "--revision",
        "Add criteria",
        "--revision",
        "Clarify users",
      ]),
    ).toEqual({
      command: "brief-decide",
      briefId: "abc",
      version: 1,
      decision: "revise",
      operatorId: "op-1",
      rationale: "Needs work",
      requestedRevisions: ["Add criteria", "Clarify users"],
    });
  });

  it("rejects an invalid decision kind", () => {
    expect(() =>
      parseFoundryArgs([
        "brief-decide",
        "--brief-id",
        "abc",
        "--version",
        "1",
        "--decision",
        "maybe",
        "--operator",
        "op-1",
        "--rationale",
        "Hmm",
      ]),
    ).toThrowError(/--decision must be one of/i);
  });

  it("rejects a non-integer version", () => {
    expect(() =>
      parseFoundryArgs(["brief-show", "--brief-id", "abc", "--version", "two"]),
    ).toThrowError(/--version must be a positive integer/i);
  });

  it("rejects missing required options", () => {
    expect(() => parseFoundryArgs(["brief-create", "--title", "Planner"])).toThrowError(
      /missing required --idea/i,
    );
  });

  it("rejects unknown commands", () => {
    expect(() => parseFoundryArgs(["brief-delete"])).toThrowError(/expected one of/i);
  });
});
