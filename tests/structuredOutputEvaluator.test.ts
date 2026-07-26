import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StructuredOutputEvaluator } from "../src/evaluations/structuredOutputEvaluator.js";

describe("StructuredOutputEvaluator", () => {
  it("passes when raw output matches the schema", () => {
    const evaluator = new StructuredOutputEvaluator(
      z.object({
        answer: z.string(),
      }),
    );

    const result = evaluator.evaluate({
      role: {
        id: "coach",
        instructions: "Explain clearly.",
      },
      task: {
        id: "structured-task",
        instruction: "Return a structured answer.",
      },
      context: [],
      prompt: "Return a structured answer.",
      output: '{"answer":"Structured response"}',
    });

    expect(result).toEqual({
      evaluatorId: "structured-output",
      passed: true,
      message: "The output matched the required structure.",
    });
  });
  it("fails when raw output is not valid JSON", () => {
    const evaluator = new StructuredOutputEvaluator(
      z.object({
        answer: z.string(),
      }),
    );

    const result = evaluator.evaluate({
      role: {
        id: "coach",
        instructions: "Explain clearly.",
      },
      task: {
        id: "structured-task",
        instruction: "Return a structured answer.",
      },
      context: [],
      prompt: "Return a structured answer.",
      output: "Not JSON",
    });

    expect(result).toEqual({
      evaluatorId: "structured-output",
      passed: false,
      message: "The output was not valid JSON.",
    });
  });
  it("fails when JSON does not match the schema", () => {
    const evaluator = new StructuredOutputEvaluator(
      z.object({
        answer: z.string(),
      }),
    );

    const result = evaluator.evaluate({
      role: {
        id: "coach",
        instructions: "Explain clearly.",
      },
      task: {
        id: "structured-task",
        instruction: "Return a structured answer.",
      },
      context: [],
      prompt: "Return a structured answer.",
      output: '{"answer":42}',
    });

    expect(result).toEqual({
      evaluatorId: "structured-output",
      passed: false,
      message: "The output did not match the required structure.",
    });
  });
});