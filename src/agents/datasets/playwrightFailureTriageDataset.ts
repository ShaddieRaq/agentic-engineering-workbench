import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

export const playwrightFailureTriageDataset =
  agentDatasetDefinitionSchema.parse({
    id: "playwright-failure-triage-smoke",
    description:
      "Exercises hidden-ground-truth classification across test, application, and environment failures.",
    agentId: "playwright-failure-triage",
    purpose: "regression",
    cases: [
      {
        id: "stale-login-locator",
        input: {
          testTitle: "customer can sign in",
          testFile:
            "examples/playwright-failure-triage/stale-login-test.txt",
          projectName: "chromium",
          retry: 1,
          status: "timed-out",
          error: {
            name: "TimeoutError",
            message:
              "locator.click: Timeout 5000ms exceeded waiting for getByTestId('submit-login')",
            stack:
              "at tests/login.spec.ts:12:52\nat LoginPage.signIn (pages/loginPage.ts:24:18)",
          },
          candidatePaths: [
            "examples/playwright-failure-triage/login-form.txt",
          ],
          verification: { mode: "none" },
        },
        expected: {
          classification: "test-defect",
          requiredEvidencePaths: [
            "examples/playwright-failure-triage/stale-login-test.txt",
            "examples/playwright-failure-triage/login-form.txt",
          ],
        },
      },
      {
        id: "checkout-handler-error",
        input: {
          testTitle: "customer completes checkout",
          testFile:
            "examples/playwright-failure-triage/checkout-test.txt",
          projectName: "chromium",
          retry: 0,
          status: "failed",
          error: {
            name: "Error",
            message: "Expected response status 200, received 500",
            stack: "at tests/checkout.spec.ts:31:28",
          },
          attachments: [
            {
              name: "trace",
              contentType: "application/zip",
              relativePath: "test-results/checkout/trace.zip",
            },
          ],
          candidatePaths: [
            "examples/playwright-failure-triage/checkout-handler.txt",
          ],
          verification: { mode: "none" },
        },
        expected: {
          classification: "application-defect",
          requiredEvidencePaths: [
            "examples/playwright-failure-triage/checkout-handler.txt",
          ],
        },
      },
      {
        id: "missing-browser-channel",
        input: {
          testTitle: "global setup",
          testFile:
            "examples/playwright-failure-triage/playwright-config.txt",
          projectName: "chrome",
          retry: 0,
          status: "interrupted",
          error: {
            name: "Error",
            message:
              "browserType.launch: Chromium distribution 'chrome' is not found at /usr/bin/google-chrome",
          },
          candidatePaths: [],
          verification: { mode: "none" },
        },
        expected: {
          classification: "environment",
          requiredEvidencePaths: [
            "examples/playwright-failure-triage/playwright-config.txt",
          ],
        },
      },
    ],
  });
