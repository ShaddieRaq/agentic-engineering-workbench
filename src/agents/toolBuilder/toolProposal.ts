import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AIProvider,
  AIProviderEvidence,
  AIProviderResult,
} from "../../providers/aiProvider.js";
import { AIProviderError } from "../../providers/aiProviderError.js";

export const toolProposalDispositionSchema = z.enum([
  "propose",
  "needs-clarification",
  "reject",
]);

const contractFieldSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    required: z.boolean(),
    description: z.string().min(1),
    limits: z.array(z.string().min(1)),
  })
  .strict();

export const generatedToolContractSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().min(1),
    readOnly: z.boolean(),
    sideEffects: z.array(z.string().min(1)),
    inputFields: z.array(contractFieldSchema),
    outputFields: z.array(contractFieldSchema),
    limits: z.array(z.string().min(1)).min(1),
    failureModes: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const toolProposalOutputSchema = z
  .object({
    disposition: toolProposalDispositionSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    rationale: z.string().min(1),
    contract: generatedToolContractSchema.nullable(),
    files: z.array(
      z
        .object({
          path: z.string().min(1),
          purpose: z.string().min(1),
          content: z.string().min(1),
        })
        .strict(),
    ),
    registrationChanges: z.array(
      z
        .object({
          path: z.string().min(1),
          description: z.string().min(1),
        })
        .strict(),
    ),
    verificationCommands: z.array(z.string().min(1)),
    clarifyingQuestions: z.array(z.string().min(1)),
    securityNotes: z.array(z.string().min(1)),
  })
  .strict();

export type ToolProposalOutput = z.infer<typeof toolProposalOutputSchema>;

export interface ToolProposalPolicyEvaluation {
  passed: boolean;
  issues: string[];
  message: string;
}

export interface ToolProposalResult {
  proposalRunId: string;
  request: string;
  prompt: string;
  rawOutput: string;
  parsedOutput: ToolProposalOutput | null;
  refusal: string | null;
  provider: AIProviderEvidence | null;
  executionFailure: {
    category: "transport" | "parsing" | "unknown";
    message: string;
  } | null;
  policyEvaluation: ToolProposalPolicyEvaluation | null;
  succeeded: boolean;
  durationMs: number;
  completedAt: string;
}

export interface ToolProposalRequest {
  request: string;
  targetToolId?: string | undefined;
  allowSideEffects: boolean;
  additionalConstraints: string[];
}

function isSafeGeneratedPath(path: string): boolean {
  if (path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    return false;
  }

  return (
    /^src\/tools\/[A-Za-z0-9]+Tool\.ts$/.test(path) ||
    /^tests\/[A-Za-z0-9]+Tool\.test\.ts$/.test(path)
  );
}

export function evaluateToolProposal(
  proposal: ToolProposalOutput,
  allowSideEffects: boolean,
): ToolProposalPolicyEvaluation {
  const issues: string[] = [];
  const paths = proposal.files.map(({ path }) => path);

  if (new Set(paths).size !== paths.length) {
    issues.push("Generated file paths must be unique.");
  }

  for (const path of paths) {
    if (!isSafeGeneratedPath(path)) {
      issues.push(`Generated path is outside the permitted proposal roots: ${path}`);
    }
  }

  if (proposal.disposition === "propose") {
    if (proposal.contract === null) {
      issues.push("A proposed tool requires a tool contract.");
    } else if (!allowSideEffects && (!proposal.contract.readOnly || proposal.contract.sideEffects.length > 0)) {
      issues.push("The proposal includes side effects that were not authorized.");
    }

    if (!paths.some((path) => path.startsWith("src/tools/"))) {
      issues.push("A proposed tool requires an implementation file under src/tools/.");
    }
    if (!paths.some((path) => path.startsWith("tests/"))) {
      issues.push("A proposed tool requires a Vitest file under tests/.");
    }
    if (proposal.registrationChanges.length === 0) {
      issues.push("A proposed tool must describe its registry changes.");
    }
    if (!proposal.verificationCommands.includes("npm run typecheck")) {
      issues.push("Verification must include npm run typecheck.");
    }
    if (!proposal.verificationCommands.some((command) => command.startsWith("npm test"))) {
      issues.push("Verification must include a targeted npm test command.");
    }
    if (proposal.clarifyingQuestions.length > 0) {
      issues.push("A complete proposal cannot retain unanswered clarifying questions.");
    }
  } else {
    if (proposal.contract !== null || proposal.files.length > 0 || proposal.registrationChanges.length > 0) {
      issues.push("A rejected or incomplete request must not contain installable code changes.");
    }
    if (proposal.verificationCommands.length > 0) {
      issues.push("A rejected or incomplete request must not contain verification commands.");
    }
    if (proposal.disposition === "needs-clarification" && proposal.clarifyingQuestions.length === 0) {
      issues.push("An incomplete request must include at least one clarifying question.");
    }
    if (proposal.disposition === "reject" && proposal.securityNotes.length === 0) {
      issues.push("A rejected request must explain the security boundary.");
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    message: issues.length === 0
      ? "The generated proposal satisfies the Tool Builder policy."
      : `The generated proposal violates policy: ${issues.join(" ")}`,
  };
}

export function buildToolProposalPrompt(input: ToolProposalRequest): string {
  return [
    "ROLE:",
    "You are the Tool Builder for a local TypeScript agent-engineering platform.",
    "Produce a reviewable proposal; never claim that files were written or commands were run.",
    "A tool is one bounded capability with strict Zod input and output schemas.",
    "Generated implementations must use ToolDefinition, deterministic limits, explicit failures, and dependency injection.",
    "Never accept arbitrary shell commands, arbitrary executable code, unrestricted paths, secrets, or caller-selected permission roots.",
    "Do not add dependencies in this version.",
    "Only propose new files under src/tools/ and tests/. Describe registry edits separately instead of replacing registry files.",
    "If requirements are incomplete, return needs-clarification with no code files.",
    "If the request cannot be safely bounded, return reject with no code files.",
    `Side effects authorized: ${input.allowSideEffects ? "yes" : "no"}`,
    input.targetToolId ? `Requested tool ID: ${input.targetToolId}` : "Requested tool ID: choose a stable kebab-case ID.",
    "Additional constraints:",
    input.additionalConstraints.length > 0
      ? input.additionalConstraints.map((constraint) => `- ${constraint}`).join("\n")
      : "- None supplied.",
    "",
    "TASK:",
    input.request.trim(),
  ].join("\n");
}

export async function runToolProposal(
  provider: AIProvider,
  input: ToolProposalRequest,
): Promise<ToolProposalResult> {
  const startedAt = performance.now();
  const prompt = buildToolProposalPrompt(input);
  let providerResult: AIProviderResult<ToolProposalOutput>;
  let executionFailure: ToolProposalResult["executionFailure"] = null;

  try {
    providerResult = await provider.generate({
      prompt,
      outputSchema: toolProposalOutputSchema,
    });
  } catch (error: unknown) {
    providerResult = {
      rawOutput: "",
      parsedOutput: null,
      refusal: null,
      provider: { model: "unknown", usage: null },
    };
    executionFailure = {
      category: error instanceof AIProviderError ? error.category : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const policyEvaluation = providerResult.parsedOutput === null
    ? null
    : evaluateToolProposal(providerResult.parsedOutput, input.allowSideEffects);

  return {
    proposalRunId: randomUUID(),
    request: input.request,
    prompt,
    rawOutput: providerResult.rawOutput,
    parsedOutput: providerResult.parsedOutput,
    refusal: providerResult.refusal,
    provider: executionFailure === null ? providerResult.provider : null,
    executionFailure,
    policyEvaluation,
    succeeded:
      executionFailure === null &&
      providerResult.refusal === null &&
      providerResult.parsedOutput !== null &&
      policyEvaluation?.passed === true,
    durationMs: performance.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
