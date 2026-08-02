import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AIProvider } from "../providers/aiProvider.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import { validateAgentCatalog } from "./agentCatalogValidator.js";
import type { AgentRegistry } from "./agentRegistry.js";
import type {
  AgentRunFailure,
  AgentRunResult,
} from "./agentRunResult.js";

export interface AgentRunnerOptions {
  agents: AgentRegistry;
  tools: ToolRegistry;
  provider: AIProvider;
  workspaceRoot: string;
  model?: string;
}

function manifestDigest(manifest: object): string {
  return createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
}

function validationMessage(error: z.ZodError): string {
  return z.prettifyError(error);
}

export async function runAgent(
  agentId: string,
  rawInput: unknown,
  options: AgentRunnerOptions,
): Promise<AgentRunResult> {
  const startedAt = performance.now();
  const registration = options.agents.get(agentId);
  const { manifest } = registration;
  const model = options.model ?? manifest.defaultModel;
  const permittedTools = options.tools.subset(manifest.permissions.toolIds);
  let input: unknown = rawInput;
  let output: unknown = null;
  let failure: AgentRunFailure | null = null;
  const catalogIssues = validateAgentCatalog(
    options.agents,
    options.tools,
  ).filter((issue) => issue.agentId === agentId);

  if (manifest.status === "retired") {
    failure = {
      stage: "catalog",
      category: "validation",
      message: `Agent ${agentId} is retired and cannot be executed.`,
    };
  } else if (catalogIssues.length > 0) {
    failure = {
      stage: "catalog",
      category: "validation",
      message: catalogIssues.map(({ message }) => message).join(" "),
    };
  } else {
    const parsedInput = registration.inputSchema.safeParse(rawInput);

    if (!parsedInput.success) {
      failure = {
        stage: "input",
        category: "validation",
        message: validationMessage(parsedInput.error),
      };
    } else {
      input = parsedInput.data;

      try {
        const candidateOutput = await registration.execute(input, {
          provider: options.provider,
          tools: permittedTools,
          workspaceRoot: options.workspaceRoot,
        });
        const parsedOutput = registration.outputSchema.safeParse(
          candidateOutput,
        );

        if (!parsedOutput.success) {
          failure = {
            stage: "output",
            category: "validation",
            message: validationMessage(parsedOutput.error),
          };
        } else {
          output = parsedOutput.data;
        }
      } catch (error: unknown) {
        failure = {
          stage: "execution",
          category: "execution",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    agentRunId: randomUUID(),
    agentId: manifest.id,
    agentVersion: manifest.version,
    manifestDigest: manifestDigest(manifest),
    manifest,
    input: input as z.infer<ReturnType<typeof z.json>>,
    configuration: {
      model,
      permittedToolIds: permittedTools.ids(),
    },
    output: output as z.infer<ReturnType<typeof z.json>> | null,
    failure,
    succeeded: failure === null,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
