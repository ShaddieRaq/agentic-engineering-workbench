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

  it("parses intake-start with optional max turns and model", () => {
    expect(
      parseFoundryArgs(["intake-start", "--title", "Planner", "--idea", "Meals"]),
    ).toEqual({
      command: "intake-start",
      title: "Planner",
      idea: "Meals",
      maxTurns: null,
      model: null,
    });
    expect(
      parseFoundryArgs([
        "intake-start",
        "--title",
        "Planner",
        "--idea",
        "Meals",
        "--max-turns",
        "3",
        "--model",
        "gpt-5.4",
      ]),
    ).toEqual({
      command: "intake-start",
      title: "Planner",
      idea: "Meals",
      maxTurns: 3,
      model: "gpt-5.4",
    });
  });

  it("parses intake-turn answers including equals signs in the text", () => {
    const questionId = "3649333b-8114-460c-8839-4fae3e6c8e17";
    expect(
      parseFoundryArgs([
        "intake-turn",
        "--brief-id",
        "abc",
        "--answer",
        `${questionId}=Latency budget = 200ms`,
        "--answer",
        "new=Also support offline mode",
      ]),
    ).toEqual({
      command: "intake-turn",
      briefId: "abc",
      answers: [
        { questionId, answer: "Latency budget = 200ms" },
        { questionId: null, answer: "Also support offline mode" },
      ],
      answersFile: null,
      model: null,
    });
  });

  it("accepts an answers file instead of inline answers", () => {
    expect(
      parseFoundryArgs([
        "intake-turn",
        "--brief-id",
        "abc",
        "--answers-file",
        "answers.json",
      ]),
    ).toEqual({
      command: "intake-turn",
      briefId: "abc",
      answers: [],
      answersFile: "answers.json",
      model: null,
    });
  });

  it("rejects intake-turn without any answer source", () => {
    expect(() =>
      parseFoundryArgs(["intake-turn", "--brief-id", "abc"]),
    ).toThrowError(/at least one --answer/i);
  });

  it("rejects malformed --answer values", () => {
    expect(() =>
      parseFoundryArgs([
        "intake-turn",
        "--brief-id",
        "abc",
        "--answer",
        "missing-separator",
      ]),
    ).toThrowError(/--answer must use the form/i);
  });

  it("parses export-claude-code", () => {
    expect(
      parseFoundryArgs(["export-claude-code", "--decision", "abc"]),
    ).toEqual({
      command: "export-claude-code",
      decisionArtifactId: "abc",
      out: null,
    });
    expect(
      parseFoundryArgs([
        "export-claude-code",
        "--decision",
        "abc",
        "--out",
        "exports/custom",
      ]),
    ).toEqual({
      command: "export-claude-code",
      decisionArtifactId: "abc",
      out: "exports/custom",
    });
    expect(() => parseFoundryArgs(["export-claude-code"])).toThrowError(
      /missing required --decision/i,
    );
  });

  it("parses import-feedback", () => {
    expect(
      parseFoundryArgs(["import-feedback", "--bundle", "feedback.json"]),
    ).toEqual({
      command: "import-feedback",
      bundlePath: "feedback.json",
      exportDir: null,
    });
    expect(
      parseFoundryArgs([
        "import-feedback",
        "--bundle",
        "feedback.json",
        "--export-dir",
        "exports/custom",
      ]),
    ).toEqual({
      command: "import-feedback",
      bundlePath: "feedback.json",
      exportDir: "exports/custom",
    });
    expect(() => parseFoundryArgs(["import-feedback"])).toThrowError(
      /missing required --bundle/i,
    );
  });

  it("parses architect commands", () => {
    expect(parseFoundryArgs(["architect-plan", "--brief-id", "abc"])).toEqual({
      command: "architect-plan",
      briefId: "abc",
      model: null,
      reviseFrom: null,
    });
    expect(
      parseFoundryArgs([
        "architect-plan",
        "--brief-id",
        "abc",
        "--revise-from",
        "p0",
      ]),
    ).toEqual({
      command: "architect-plan",
      briefId: "abc",
      model: null,
      reviseFrom: "p0",
    });
    expect(parseFoundryArgs(["plan-show", "--plan-id", "p1"])).toEqual({
      command: "plan-show",
      planId: "p1",
    });
    expect(
      parseFoundryArgs([
        "plan-decide",
        "--plan-id",
        "p1",
        "--decision",
        "revise",
        "--operator",
        "op-1",
        "--rationale",
        "Needs work",
        "--revision",
        "Fix coverage",
      ]),
    ).toEqual({
      command: "plan-decide",
      planId: "p1",
      decision: "revise",
      operatorId: "op-1",
      rationale: "Needs work",
      requestedRevisions: ["Fix coverage"],
    });
    expect(() =>
      parseFoundryArgs(["plan-decide", "--plan-id", "p1", "--decision", "maybe", "--operator", "o", "--rationale", "r"]),
    ).toThrowError(/--decision must be one of/i);
  });

  it("parses capability commands", () => {
    expect(parseFoundryArgs(["capability-plan", "--plan-id", "p1"])).toEqual({
      command: "capability-plan",
      planId: "p1",
      model: null,
      reviseFrom: null,
    });
    expect(
      parseFoundryArgs(["capability-show", "--capability-plan-id", "c1"]),
    ).toEqual({ command: "capability-show", capabilityPlanId: "c1" });
    expect(
      parseFoundryArgs([
        "capability-decide",
        "--capability-plan-id",
        "c1",
        "--decision",
        "approve",
        "--operator",
        "op-1",
        "--rationale",
        "Mapped fully",
      ]),
    ).toEqual({
      command: "capability-decide",
      capabilityPlanId: "c1",
      decision: "approve",
      operatorId: "op-1",
      rationale: "Mapped fully",
      requestedRevisions: [],
    });
  });

  it("parses test-design commands", () => {
    expect(
      parseFoundryArgs(["design-tests", "--capability-plan-id", "c1"]),
    ).toEqual({
      command: "design-tests",
      capabilityPlanId: "c1",
      model: null,
      reviseFrom: null,
    });
    expect(parseFoundryArgs(["tests-show", "--test-suite-id", "t1"])).toEqual({
      command: "tests-show",
      testSuiteId: "t1",
    });
    expect(
      parseFoundryArgs([
        "tests-decide",
        "--test-suite-id",
        "t1",
        "--decision",
        "approve",
        "--operator",
        "op-1",
        "--rationale",
        "Covers everything",
      ]),
    ).toEqual({
      command: "tests-decide",
      testSuiteId: "t1",
      decision: "approve",
      operatorId: "op-1",
      rationale: "Covers everything",
      requestedRevisions: [],
    });
  });

  it("parses intake-status", () => {
    expect(parseFoundryArgs(["intake-status", "--brief-id", "abc"])).toEqual({
      command: "intake-status",
      briefId: "abc",
    });
  });

  it("parses the governed-build commands", () => {
    expect(
      parseFoundryArgs(["work-order", "--test-suite-id", "s1", "--next"]),
    ).toEqual({
      command: "work-order",
      testSuiteId: "s1",
      sliceId: null,
      next: true,
    });
    expect(
      parseFoundryArgs([
        "work-order",
        "--test-suite-id",
        "s1",
        "--slice-id",
        "slice-9",
      ]),
    ).toEqual({
      command: "work-order",
      testSuiteId: "s1",
      sliceId: "slice-9",
      next: false,
    });
    expect(() =>
      parseFoundryArgs(["work-order", "--test-suite-id", "s1"]),
    ).toThrowError(/--slice-id.*--next/);
    expect(
      parseFoundryArgs(["work-order-show", "--work-order-id", "w1"]),
    ).toEqual({ command: "work-order-show", workOrderId: "w1" });
    expect(
      parseFoundryArgs([
        "materialize-tests",
        "--work-order-id",
        "w1",
        "--project-root",
        "/tmp/project",
      ]),
    ).toEqual({
      command: "materialize-tests",
      workOrderId: "w1",
      projectRoot: "/tmp/project",
    });
    expect(
      parseFoundryArgs([
        "submit-slice",
        "--work-order-id",
        "w1",
        "--project-root",
        "/tmp/project",
      ]),
    ).toEqual({
      command: "submit-slice",
      workOrderId: "w1",
      projectRoot: "/tmp/project",
    });
    expect(
      parseFoundryArgs([
        "submission-decide",
        "--submission-id",
        "sub-1",
        "--decision",
        "revise",
        "--operator",
        "op-1",
        "--rationale",
        "Tests were tampered with",
        "--revision",
        "Restore the acceptance tests",
      ]),
    ).toEqual({
      command: "submission-decide",
      submissionId: "sub-1",
      decision: "revise",
      operatorId: "op-1",
      rationale: "Tests were tampered with",
      requestedRevisions: ["Restore the acceptance tests"],
    });
  });
});
