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
}

export interface TypedAgentRegistration<TInput, TOutput> {
  manifest: AgentManifest;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  execute(
    input: TInput,
    services: AgentExecutionServices,
  ): Promise<TOutput>;
}

export function defineAgent<TInput, TOutput>(
  registration: TypedAgentRegistration<TInput, TOutput>,
): AgentRegistration {
  const manifest = agentManifestSchema.parse(registration.manifest);

  return {
    manifest,
    inputSchema: registration.inputSchema,
    outputSchema: registration.outputSchema,
    execute(input, services) {
      return registration.execute(input as TInput, services);
    },
  };
}
