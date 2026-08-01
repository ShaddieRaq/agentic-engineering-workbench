import { describe, expect, it } from "vitest";
import { z } from "zod";
import { executeTool } from "../src/tools/toolExecutor.js";
import { ToolTimeoutError } from "../src/tools/toolTimeoutError.js";

describe("executeTool", () => {
  it("records normalized input defaults", async () => {
    const evidence = await executeTool(
      {
        id: "defaulting-tool",
        description: "Apply an input default.",
        inputSchema: z.object({ value: z.string().default("default") }),
        outputSchema: z.string(),
        async execute(input) {
          return input.value;
        },
      },
      {},
    );

    expect(evidence.input).toEqual({ value: "default" });
    expect(evidence.output).toBe("default");
  });

  it("classifies invalid tool output as an execution failure", async () => {
    const evidence = await executeTool(
      {
        id: "broken-tool",
        description: "Return invalid output.",
        inputSchema: z.object({}).strict(),
        outputSchema: z.string(),
        async execute() {
          return 42 as unknown as string;
        },
      },
      {},
    );

    expect(evidence).toMatchObject({
      output: null,
      failure: { category: "execution" },
      succeeded: false,
    });
  });

  it("classifies a tool deadline as a timeout failure", async () => {
    const evidence = await executeTool(
      {
        id: "slow-tool",
        description: "Exceed a deadline.",
        inputSchema: z.object({}).strict(),
        outputSchema: z.string(),
        async execute() {
          throw new ToolTimeoutError("Tool exceeded its deadline.");
        },
      },
      {},
    );

    expect(evidence.failure).toEqual({
      category: "timeout",
      message: "Tool exceeded its deadline.",
    });
  });
});
