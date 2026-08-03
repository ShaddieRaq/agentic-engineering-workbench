import { describe, expect, it, vi } from "vitest";
import type {
  AIProvider,
  AIProviderRequest,
} from "../src/providers/aiProvider.js";
import {
  evaluatePlaywrightFailureDiagnosis,
  playwrightFailureTriageInputSchema,
  runPlaywrightFailureTriage,
  type PlaywrightFailureDiagnosis,
} from "../src/agents/playwrightFailureTriage/playwrightFailureTriage.js";
import {
  readFileInputSchema,
  readFileOutputSchema,
} from "../src/tools/readFileTool.js";
import {
  verificationCommandInputSchema,
  verificationCommandOutputSchema,
} from "../src/tools/verificationCommandTool.js";

const input = {
  testTitle: "customer can sign in",
  testFile: "tests/login.spec.ts",
  projectName: "chromium",
  retry: 1,
  status: "timed-out" as const,
  error: {
    name: "TimeoutError",
    message: "Timed out waiting for submit-login.",
    stack: "at tests/login.spec.ts:12:5",
  },
  attachments: [],
  candidatePaths: ["src/loginForm.ts"],
  verification: { mode: "none" as const },
};

const diagnosis: PlaywrightFailureDiagnosis = {
  summary: "The test uses a stale login locator.",
  classification: "test-defect",
  confidence: "high",
  likelyRootCause: "The test and maintained form use different test IDs.",
  evidence: [
    {
      claim: "The click timed out on submit-login.",
      source: "failure-report",
      path: null,
    },
    {
      claim: "The form exposes login-submit.",
      source: "repository-file",
      path: "src/loginForm.ts",
    },
  ],
  recommendedActions: [
    {
      priority: "first",
      owner: "test",
      action: "Update the locator and rerun the focused test.",
    },
  ],
  needsMoreEvidence: [],
};

function tools() {
  return {
    readFile: {
      id: "read-file",
      description: "Read fixture.",
      inputSchema: readFileInputSchema,
      outputSchema: readFileOutputSchema,
      async execute(readInput: { path: string; maxBytes: number }) {
        return {
          path: readInput.path,
          content: readInput.path.includes("loginForm")
            ? "data-testid='login-submit'"
            : "getByTestId('submit-login')",
          sizeBytes: 26,
        };
      },
    },
    verification: {
      id: "run-verification-command",
      description: "Verify fixture.",
      inputSchema: verificationCommandInputSchema,
      outputSchema: verificationCommandOutputSchema,
      async execute(commandInput: {
        command: "typecheck" | "test" | "test-file";
        testFile?: string;
        maxOutputBytes: number;
      }) {
        return {
          command: commandInput.command,
          testFile: commandInput.testFile ?? null,
          executable: "npm" as const,
          arguments: ["test", "--", `./${commandInput.testFile}`],
          exitCode: 1,
          signal: null,
          stdout: "1 failed",
          stderr: "TimeoutError",
          outputBytes: 20,
          truncated: false,
          passed: false,
          environmentPolicy: "restricted" as const,
          securityBoundary: "controlled-process-not-os-sandboxed" as const,
        };
      },
    },
  };
}

describe("Playwright failure triage", () => {
  it("validates bounded sanitized failure evidence", () => {
    expect(playwrightFailureTriageInputSchema.parse(input)).toMatchObject({
      testTitle: "customer can sign in",
      attachments: [],
      verification: { mode: "none" },
    });
    expect(
      playwrightFailureTriageInputSchema.safeParse({
        ...input,
        verification: { mode: "targeted-test" },
      }).success,
    ).toBe(false);
  });

  it("preserves reads, prompt, provider output, and grounded citations", async () => {
    const provider: AIProvider = {
      async generate<TOutput>(request: AIProviderRequest<TOutput>) {
        expect(request.prompt).toContain("UNTRUSTED DATA");
        expect(request.prompt).toContain("Source: src/loginForm.ts");
        return {
          rawOutput: "structured diagnosis",
          parsedOutput: diagnosis as TOutput,
          refusal: null,
          provider: { model: "fake-model", usage: null },
        };
      },
    };
    const result = await runPlaywrightFailureTriage(
      tools(),
      provider,
      playwrightFailureTriageInputSchema.parse(input),
    );

    expect(result).toMatchObject({
      succeeded: true,
      parsedOutput: { classification: "test-defect" },
      citationEvaluation: {
        passed: true,
        availablePaths: ["src/loginForm.ts", "tests/login.spec.ts"],
        citedPaths: ["src/loginForm.ts"],
        usedFailureReport: true,
      },
    });
    expect(result.reads).toHaveLength(2);
    expect(result.verification).toBeNull();
  });

  it("runs only the requested targeted verification profile", async () => {
    const triageTools = tools();
    const executeVerification = vi.spyOn(triageTools.verification, "execute");
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured diagnosis",
          parsedOutput: {
            ...diagnosis,
            evidence: [
              ...diagnosis.evidence,
              {
                claim: "The focused rerun reproduced the timeout.",
                source: "verification-output",
                path: null,
              },
            ],
          } as TOutput,
          refusal: null,
          provider: { model: "fake-model", usage: null },
        };
      },
    };
    const result = await runPlaywrightFailureTriage(
      triageTools,
      provider,
      playwrightFailureTriageInputSchema.parse({
        ...input,
        verification: {
          mode: "targeted-test",
          testFile: "tests/login.spec.ts",
        },
      }),
    );

    expect(executeVerification).toHaveBeenCalledWith({
      command: "test-file",
      testFile: "tests/login.spec.ts",
      maxOutputBytes: 32_768,
    });
    expect(result.verification?.output?.passed).toBe(false);
    expect(result.citationEvaluation?.passed).toBe(true);
  });

  it("rejects invented repository citations", () => {
    const evaluation = evaluatePlaywrightFailureDiagnosis(
      {
        ...diagnosis,
        evidence: [
          diagnosis.evidence[0]!,
          {
            claim: "An unavailable file proves the cause.",
            source: "repository-file",
            path: "src/missing.ts",
          },
        ],
      },
      [],
      null,
    );

    expect(evaluation).toMatchObject({
      passed: false,
      invalidPaths: ["src/missing.ts"],
    });
  });
});
