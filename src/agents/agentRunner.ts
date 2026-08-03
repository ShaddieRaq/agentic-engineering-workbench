import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AIProvider } from "../providers/aiProvider.js";
import { createUsageCollectingProvider } from "../providers/usageCollectingProvider.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import { validateAgentCatalog } from "./agentCatalogValidator.js";
import {
  agentCandidateIdentitySchema,
  type AgentCandidateIdentity,
} from "./agentCandidateIdentity.js";
import { digestJsonEvidence } from "./agentEvidenceDigest.js";
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
  workspaceId?: string;
  model?: string;
  candidate?: AgentCandidateIdentity;
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
  const candidate = options.candidate
    ? agentCandidateIdentitySchema.safeParse(options.candidate)
    : null;
  const serializedInput = z.json().safeParse(rawInput);
  let input: unknown = serializedInput.success ? serializedInput.data : null;
  let output: unknown = null;
  let assessment: AgentRunResult["assessment"] = null;
  let failure: AgentRunFailure | null = null;
  const warnings = manifest.status === "deprecated"
    ? [`Agent ${agentId}@${manifest.version} is deprecated.`]
    : [];
  const catalogIssues = validateAgentCatalog(
    options.agents,
    options.tools,
  ).filter((issue) => issue.agentId === agentId);
  const collectingProvider = createUsageCollectingProvider(options.provider);

  if (candidate !== null && !candidate.success) {
    failure = {
      stage: "catalog",
      category: "validation",
      message: "Candidate identity is invalid.",
    };
  } else if (
    candidate?.success &&
    (
      candidate.data.subjectAgentId !== manifest.id ||
      candidate.data.baseVersion !== manifest.version
    )
  ) {
    failure = {
      stage: "catalog",
      category: "validation",
      message: "Candidate identity does not match the registered subject.",
    };
  } else if (!serializedInput.success) {
    failure = {
      stage: "input",
      category: "validation",
      message: "Agent input must be JSON-serializable.",
    };
  } else if (manifest.status === "retired") {
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
    const parsedInput = registration.inputSchema.safeParse(input);

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
          provider: collectingProvider.provider,
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
          const serializedOutput = z.json().safeParse(parsedOutput.data);

          if (!serializedOutput.success) {
            failure = {
              stage: "output",
              category: "validation",
              message: "Agent output must be JSON-serializable.",
            };
          } else {
            output = serializedOutput.data;
            assessment = registration.assess(output);

            if (!assessment.passed) {
              failure = {
                stage: "evaluation",
                category: "evaluation",
                message: assessment.message,
              };
            }
          }
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

  const provider = collectingProvider.evidence(model);

  return {
    agentRunId: randomUUID(),
    agentId: manifest.id,
    agentVersion: manifest.version,
    manifestDigest: digestJsonEvidence(manifest),
    manifest,
    ...(candidate?.success ? { candidate: candidate.data } : {}),
    input: input as z.infer<ReturnType<typeof z.json>>,
    configuration: {
      model,
      permittedToolIds: permittedTools.ids(),
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    },
    warnings,
    output: output as z.infer<ReturnType<typeof z.json>> | null,
    assessment,
    failure,
    ...(provider ? { provider } : {}),
    succeeded: failure === null,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
