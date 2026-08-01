import type { ZodType } from "zod";

export interface ToolDefinition<TInput, TOutput> {
  id: string;
  description: string;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  execute(input: TInput): Promise<TOutput>;
}
