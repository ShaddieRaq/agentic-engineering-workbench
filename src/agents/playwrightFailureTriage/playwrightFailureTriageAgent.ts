import { z } from "zod";
import type {
  ReadFileInput,
  ReadFileOutput,
} from "../../tools/readFileTool.js";
import type {
  VerificationCommandInput,
  VerificationCommandOutput,
} from "../../tools/verificationCommandTool.js";
import { defineAgent } from "../agentRegistration.js";
import {
  playwrightFailureClassificationSchema,
  playwrightFailureTriageExpectationSchema,
  playwrightFailureTriageInputSchema,
  runPlaywrightFailureTriage,
  type PlaywrightFailureTriageTools,
} from "./playwrightFailureTriage.js";

export const playwrightFailureTriageAgentOutputSchema = z
  .object({
    triageRunId: z.string().min(1),
    succeeded: z.boolean(),
    summary: z.string().nullable(),
    classification: playwrightFailureClassificationSchema.nullable(),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
    needsMoreEvidence: z.array(z.string().min(1)),
    triageEvidence: z.json(),
  })
  .strict();

export type PlaywrightFailureTriageAgentOutput = z.infer<
  typeof playwrightFailureTriageAgentOutputSchema
>;

export const playwrightFailureTriageAgent = defineAgent({
  manifest: {
    id: "playwright-failure-triage",
    name: "Playwright Failure Triage",
    version: "0.1.0",
    status: "experimental",
    description:
      "Classifies Playwright failures from sanitized reports and bounded repository evidence.",
    owner: "local-platform",
    tags: ["playwright", "quality-engineering", "failure-triage"],
    defaultModel: "gpt-5.4",
    reasoningTier: "advanced",
    components: {
      workflowIds: ["playwright-failure-triage"],
      harnessIds: [],
      scenarioIds: [],
      datasetIds: [],
    },
    permissions: {
      toolIds: ["read-file", "run-verification-command"],
    },
    verification: {
      datasetIds: ["playwright-failure-triage-smoke"],
      minimumPassRate: 1,
    },
  },
  inputSchema: playwrightFailureTriageInputSchema,
  outputSchema: playwrightFailureTriageAgentOutputSchema,
  async execute(input, services): Promise<PlaywrightFailureTriageAgentOutput> {
    const tools: PlaywrightFailureTriageTools = {
      readFile: services.tools.get<ReadFileInput, ReadFileOutput>("read-file"),
      verification: services.tools.get<
        VerificationCommandInput,
        VerificationCommandOutput
      >("run-verification-command"),
    };
    const result = await runPlaywrightFailureTriage(
      tools,
      services.provider,
      input,
    );

    return {
      triageRunId: result.triageRunId,
      succeeded: result.succeeded,
      summary: result.parsedOutput?.summary ?? null,
      classification: result.parsedOutput?.classification ?? null,
      confidence: result.parsedOutput?.confidence ?? null,
      needsMoreEvidence: result.parsedOutput?.needsMoreEvidence ?? [],
      triageEvidence: result as unknown as z.infer<ReturnType<typeof z.json>>,
    };
  },
  assess(output) {
    return {
      passed: output.succeeded,
      message: output.succeeded
        ? "Failure triage completed with grounded evidence."
        : "Failure triage did not produce grounded successful evidence.",
    };
  },
  assessDatasetCase(_input, output, rawExpected) {
    const expected = playwrightFailureTriageExpectationSchema.parse(rawExpected);
    const evidence = z
      .object({
        parsedOutput: z
          .object({
            evidence: z.array(
              z.object({
                source: z.string(),
                path: z.string().nullable(),
              }),
            ),
          })
          .nullable(),
      })
      .passthrough()
      .parse(output.triageEvidence);
    const citedPaths = new Set(
      evidence.parsedOutput?.evidence.flatMap(({ path }) =>
        path === null ? [] : [path],
      ) ?? [],
    );
    const missingPaths = expected.requiredEvidencePaths.filter(
      (path) => !citedPaths.has(path),
    );
    const classificationMatches = output.classification === expected.classification;
    const passed = output.succeeded && classificationMatches && missingPaths.length === 0;

    return {
      passed,
      message: passed
        ? "Classification and required citations match hidden ground truth."
        : [
            classificationMatches
              ? null
              : `Expected ${expected.classification}; received ${output.classification ?? "no classification"}.`,
            missingPaths.length === 0
              ? null
              : `Missing required citations: ${missingPaths.join(", ")}.`,
          ]
            .filter((message): message is string => message !== null)
            .join(" "),
    };
  },
});
