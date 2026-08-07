import { z } from "zod";
import { architecturePlanSchema } from "../../foundry/architecturePlan.js";
import { projectBriefSchema } from "../../foundry/projectBrief.js";
import { revisionContextSchema } from "../../foundry/revisionContext.js";
import {
  testSuiteContentShapeSchema,
  testSuiteOutputSchema,
} from "../../foundry/testSuite.js";
import { reconcileTestSuiteContent } from "../../foundry/testSuiteReconciliation.js";
import { defineAgent, type AgentRegistration } from "../agentRegistration.js";
import { defineAgentRevisionSurface } from "../agentRevisionSurface.js";
import {
  testDesignerBaselinePolicy,
  testDesignerPolicySchema,
  type TestDesignerPolicy,
} from "./testDesignerPolicy.js";
import { assessTestDesignerExpectation } from "./testDesignerExpectation.js";
import { buildTestDesignerPrompt } from "./testDesignerPrompt.js";

export const testDesignerInputSchema = z
  .object({
    brief: projectBriefSchema,
    plan: architecturePlanSchema,
    revision: revisionContextSchema.optional(),
  })
  .strict();

export function createTestDesignerAgent(
  policy: TestDesignerPolicy = testDesignerBaselinePolicy,
): AgentRegistration {
  const effectivePolicy = testDesignerPolicySchema.parse(policy);

  return defineAgent({
    manifest: {
      id: "test-designer",
      name: "Test Designer",
      version: "0.2.0",
      status: "experimental",
      description:
        "Writes executable acceptance tests from the approved planning chain " +
        "before implementation exists, including a protected holdout subset.",
      owner: "local-platform",
      tags: ["foundry", "testing"],
      defaultModel: "gpt-5.4-mini",
      components: {
        workflowIds: [],
        harnessIds: [],
        scenarioIds: [],
        datasetIds: [],
      },
      permissions: { toolIds: [] },
      verification: { datasetIds: ["test-designer-smoke"], minimumPassRate: 1 },
    },
    inputSchema: testDesignerInputSchema,
    outputSchema: testSuiteOutputSchema,
    revisionSurface: defineAgentRevisionSurface<TestDesignerPolicy>({
      schema: testDesignerPolicySchema,
      baselinePolicy: testDesignerBaselinePolicy,
      mutableFields: ["instructions"],
      createCandidate: createTestDesignerAgent,
    }),
    assessDatasetCase(_input, output, expected) {
      return assessTestDesignerExpectation(output, expected);
    },
    async execute(input, services) {
      const result = await services.provider.generate({
        prompt: buildTestDesignerPrompt(
          input.brief,
          input.plan,
          effectivePolicy,
          input.revision,
        ),
        outputSchema: testSuiteContentShapeSchema,
      });

      if (result.refusal !== null) {
        throw new Error(`Provider refused the test suite: ${result.refusal}`);
      }
      if (result.parsedOutput === null) {
        throw new Error(
          `Provider returned no parsable test suite: ${result.rawOutput}`,
        );
      }

      return reconcileTestSuiteContent(
        testSuiteContentShapeSchema.parse(result.parsedOutput),
        input.brief,
        input.plan,
      );
    },
    assess(output) {
      if (output.testFiles.length === 0) {
        return { passed: false, message: "Test suite contains no test files." };
      }
      const visible = output.testFiles.filter(
        ({ visibility }) => visibility === "visible",
      ).length;
      const holdout = output.testFiles.length - visible;
      const blockingConcerns = output.concerns.filter(
        ({ severity }) => severity === "blocking",
      ).length;
      return {
        passed: true,
        message:
          `Suite produced ${visible} visible and ${holdout} holdout test ` +
          `file(s), ${output.manualChecks.length} manual check(s), and ` +
          `${blockingConcerns} blocking concern(s).`,
      };
    },
  });
}

export const testDesignerAgent = createTestDesignerAgent();
