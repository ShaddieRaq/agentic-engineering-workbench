import type { ZodType } from "zod";
import type { AIProvider } from "../providers/aiProvider.js";
import type { ToolDefinition } from "../tools/toolDefinition.js";
import {
  agentManifestSchema,
  type AgentManifest,
} from "./agentManifest.js";

export interface AgentToolCatalog {
  get<TInput, TOutput>(id: string): ToolDefinition<TInput, TOutput>;
  ids(): string[];
}

export interface AgentExecutionServices {
  provider: AIProvider;
  tools: AgentToolCatalog;
  workspaceRoot: string;
}

export interface AgentRegistration {
  manifest: AgentManifest;
  inputSchema: ZodType;
  outputSchema: ZodType;
  execute(
    input: unknown,
    services: AgentExecutionServices,
  ): Promise<unknown>;
  assess(output: unknown): AgentOutputAssessment;
  assessDatasetCase?(
    input: unknown,
    output: unknown,
    expected: unknown,
  ): AgentOutputAssessment;
}

export interface AgentOutputAssessment {
  passed: boolean;
  message: string;
}

export interface TypedAgentRegistration<TInput, TOutput> {
  manifest: AgentManifest;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  execute(
    input: TInput,
    services: AgentExecutionServices,
  ): Promise<TOutput>;
  assess?(output: TOutput): AgentOutputAssessment;
  assessDatasetCase?(
    input: TInput,
    output: TOutput,
    expected: unknown,
  ): AgentOutputAssessment;
}

export function defineAgent<TInput, TOutput>(
  registration: TypedAgentRegistration<TInput, TOutput>,
): AgentRegistration {
  const manifest = agentManifestSchema.parse(registration.manifest);

  const defined: AgentRegistration = {
    manifest,
    inputSchema: registration.inputSchema,
    outputSchema: registration.outputSchema,
    execute(input, services) {
      return registration.execute(input as TInput, services);
    },
    assess(output) {
      return registration.assess?.(output as TOutput) ?? {
        passed: true,
        message: "Agent output satisfied its runtime contract.",
      };
    },
  };

  if (registration.assessDatasetCase) {
    defined.assessDatasetCase = (input, output, expected) =>
      registration.assessDatasetCase!(
        input as TInput,
        output as TOutput,
        expected,
      );
  }

  return defined;
}
