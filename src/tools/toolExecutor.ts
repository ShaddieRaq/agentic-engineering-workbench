import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { ToolDefinition } from "./toolDefinition.js";
import { ToolPermissionError } from "./toolPermissionError.js";

export type ToolFailureCategory =
  | "validation"
  | "permission"
  | "execution";

export interface ToolFailure {
  category: ToolFailureCategory;
  message: string;
}

export interface ToolCallEvidence<TOutput> {
  toolCallId: string;
  toolId: string;
  input: unknown;
  output: TOutput | null;
  failure: ToolFailure | null;
  durationMs: number;
  completedAt: string;
  succeeded: boolean;
}

export async function executeTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  input: unknown,
): Promise<ToolCallEvidence<TOutput>> {
  const startedAt = performance.now();
  let evidenceInput = input;
  let output: TOutput | null = null;
  let failure: ToolFailure | null = null;

  try {
    const validatedInput = tool.inputSchema.parse(input);
    evidenceInput = validatedInput;

    try {
      const rawOutput = await tool.execute(validatedInput);
      output = tool.outputSchema.parse(rawOutput);
    } catch (error: unknown) {
      failure = {
        category:
          error instanceof ToolPermissionError
            ? "permission"
            : "execution",
        message:
          error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error: unknown) {
    failure = {
      category: error instanceof ZodError ? "validation" : "execution",
      message:
        error instanceof Error ? error.message : String(error),
    };
  }

  return {
    toolCallId: randomUUID(),
    toolId: tool.id,
    input: evidenceInput,
    output,
    failure,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
    succeeded: failure === null,
  };
}
