import { describe, expect, it } from "vitest";
import { parseAgentArgs } from "../src/cli/parseAgentArgs.js";

describe("parseAgentArgs", () => {
  it("parses an agent scaffold command", () => {
    expect(parseAgentArgs(["scaffold", "my-first-agent"])).toEqual({
      command: "scaffold",
      agentId: "my-first-agent",
    });
  });
  it("parses metadata commands without execution configuration", () => {
    expect(parseAgentArgs(["list"])).toEqual({ command: "list" });
    expect(parseAgentArgs(["validate"])).toEqual({ command: "validate" });
    expect(parseAgentArgs(["inventory"])).toEqual({ command: "inventory" });
    expect(parseAgentArgs(["describe", "repository-assistant"])).toEqual({
      command: "describe",
      agentId: "repository-assistant",
    });
  });

  it("parses a configured agent run", () => {
    expect(
      parseAgentArgs([
        "run",
        "repository-assistant",
        "--input",
        "input.json",
        "--model",
        "test-model",
      ]),
    ).toEqual({
      command: "run",
      agentId: "repository-assistant",
      inputPath: "input.json",
      model: "test-model",
    });
  });

  it("parses an agent reliability test policy", () => {
    expect(
      parseAgentArgs([
        "test",
        "repository-assistant",
        "--repetitions",
        "3",
        "--concurrency",
        "2",
      ]),
    ).toEqual({
      command: "test",
      agentId: "repository-assistant",
      repetitions: 3,
      concurrency: 2,
      model: null,
    });
  });

  it("rejects missing commands and values", () => {
    expect(() => parseAgentArgs([])).toThrow("Expected one of");
    expect(() => parseAgentArgs(["describe"])).toThrow("agent ID");
    expect(() =>
      parseAgentArgs(["run", "repository-assistant", "--input"]),
    ).toThrow("Missing value for --input");
    expect(() =>
      parseAgentArgs([
        "test",
        "repository-assistant",
        "--repetitions",
        "0",
      ]),
    ).toThrow("positive integer");
  });
});
