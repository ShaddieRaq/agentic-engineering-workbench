import type { AIProviderRequest } from "../providers/aiProvider.js";
import type { RepositoryContextAssembly } from "./repositoryContextLoader.js";
import { buildRepositoryContextPromptEvidence } from "./repositoryContextPrompt.js";
import {
  repositoryAnalysisOutputSchema,
  type RepositoryAnalysisOutput,
} from "./repositoryAnalysisOutput.js";

const defaultInstruction = [
  "Analyze this repository for an engineer who must work in it.",
  "Explain the architecture, identify executable entry points and concrete risks,",
  "and recommend tests that would provide useful confidence.",
].join(" ");

export function buildRepositoryAnalysisRequest(
  assembly: RepositoryContextAssembly,
  instruction = defaultInstruction,
): AIProviderRequest<RepositoryAnalysisOutput> {
  if (instruction.trim().length === 0) {
    throw new Error("Repository analysis instruction must not be empty.");
  }

  const { contextSections, rejectedSummary } =
    buildRepositoryContextPromptEvidence(assembly);

  return {
    prompt: [
      "ROLE:",
      "You are a repository analysis assistant.",
      "Use only the supplied context. Do not claim that unobserved files or behavior exist.",
      "Every architecture component, entry point, risk, and test recommendation must cite exact Source paths.",
      "",
      `Context completeness: ${assembly.complete ? "complete" : "incomplete"}`,
      `Context bytes: ${assembly.totalBytes}/${assembly.maximumBytes}`,
      "Rejected candidates:",
      rejectedSummary,
      "",
      "CONTEXT FILES:",
      contextSections.join("\n\n---\n\n"),
      "",
      "TASK:",
      instruction.trim(),
    ].join("\n"),
    outputSchema: repositoryAnalysisOutputSchema,
  };
}
