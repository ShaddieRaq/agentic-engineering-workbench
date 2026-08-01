import { describe, expect, it } from "vitest";
import { parseDatasetArgs } from "../src/cli/parseDatasetArgs.js";

describe("parseDatasetArgs", () => {
  it("parses a dataset execution request", () => {
    expect(
      parseDatasetArgs([
        "--dataset",
        "agentic-harness-audiences",
        "--role",
        "roles/technical-coach.md",
        "--harness",
        "basic-reliability",
        "--repetitions",
        "3",
        "--concurrency",
        "2",
      ]),
    ).toEqual({
      datasetId: "agentic-harness-audiences",
      rolePath: "roles/technical-coach.md",
      harnessId: "basic-reliability",
      repetitions: 3,
      concurrency: 2,
    });
  });

  it("uses safe execution defaults", () => {
    expect(
      parseDatasetArgs([
        "--dataset",
        "agentic-harness-audiences",
        "--role",
        "roles/technical-coach.md",
      ]),
    ).toMatchObject({
      harnessId: "technical-coach",
      repetitions: 1,
      concurrency: 1,
    });
  });

  it("rejects a missing dataset", () => {
    expect(() =>
      parseDatasetArgs([
        "--role",
        "roles/technical-coach.md",
      ]),
    ).toThrow("Missing required --dataset argument");
  });

  it("rejects invalid execution options", () => {
    expect(() =>
      parseDatasetArgs([
        "--dataset",
        "agentic-harness-audiences",
        "--role",
        "roles/technical-coach.md",
        "--concurrency",
        "0",
      ]),
    ).toThrow();
  });
});
