import { describe, expect, it } from "vitest";
import { parseExperimentArgs } from "../src/cli/parseExperimentArgs.js";

describe("parseExperimentArgs", () => {
  it("parses a role comparison experiment", () => {
    expect(
      parseExperimentArgs([
        "--experiment",
        "audience-prompt",
        "--dataset",
        "agentic-harness-audiences",
        "--baseline-role",
        "roles/technical-coach.md",
        "--candidate-role",
        "roles/audience-aware-coach.md",
        "--repetitions",
        "3",
        "--concurrency",
        "2",
      ]),
    ).toEqual({
      id: "audience-prompt",
      datasetId: "agentic-harness-audiences",
      harnessId: "technical-coach",
      baseline: {
        id: "baseline",
        rolePath: "roles/technical-coach.md",
      },
      candidate: {
        id: "candidate",
        rolePath: "roles/audience-aware-coach.md",
      },
      execution: {
        repetitions: 3,
        concurrency: 2,
      },
    });
  });

  it("rejects a missing candidate role", () => {
    expect(() =>
      parseExperimentArgs([
        "--dataset",
        "agentic-harness-audiences",
        "--baseline-role",
        "roles/technical-coach.md",
      ]),
    ).toThrow("Missing required --candidate-role argument");
  });
});
