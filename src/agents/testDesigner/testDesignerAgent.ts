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
    // Evolution round (Decision 088): the prior approved suite (holdouts
    // included — the designer authors holdouts; only the BUILDER never
    // sees them) plus enumerated succession requirements. The service
    // validates the output against these deterministically.
    evolution: z
      .object({
        priorSuiteContent: testSuiteContentShapeSchema,
        requiredHoldoutCount: z.number().int().min(1).max(40),
        unchangedCriterionIds: z.array(z.uuid()).max(50),
        changedCriterionIds: z.array(z.uuid()).max(50),
        newCriterionIds: z.array(z.uuid()).max(50),
        retiredCriterionIds: z.array(z.uuid()).max(50),
      })
      .strict()
      .optional(),
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
      version: "0.3.0",
      status: "experimental",
      description:
        "Writes executable acceptance tests from the approved planning chain " +
        "before implementation exists, including a protected holdout subset.",
      owner: "local-platform",
      tags: ["foundry", "testing"],
      // Model qualification by live evidence (Decision 086 forced,
      // 2026-08-09): mini failed this stage four distinct ways across
      // three projects — the chain's largest single-shot generation task
      // gets the strongest model, like the builder role always has.
      defaultModel: "gpt-5.4",
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
          input.evolution,
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

      const content = testSuiteContentShapeSchema.parse(result.parsedOutput);
      // Evolution rounds: the model emits ONLY delta files (revised, new,
      // and the one new holdout); every prior file it did not touch is
      // merged in verbatim here — byte-exact carry by construction, never
      // by model reproduction (live lesson: five attempts at echoing the
      // prior suite all starved the delta files of output budget). Prior
      // files whose covered criteria all left the brief are retired by
      // omission.
      if (input.evolution) {
        const emittedPaths = new Set(content.testFiles.map(({ path }) => path));
        const briefCriterionIds = new Set(
          input.brief.acceptanceCriteria.map(({ id }) => id),
        );
        const carried = input.evolution.priorSuiteContent.testFiles.filter(
          (file) =>
            !emittedPaths.has(file.path) &&
            file.coveredCriterionIds.some((id) => briefCriterionIds.has(id)),
        );
        content.testFiles = [...carried, ...content.testFiles];
      }
      try {
        return reconcileTestSuiteContent(content, input.brief, input.plan);
      } catch (error: unknown) {
        // Validation failures persist with the model's actual coverage map
        // so repeated failures are diagnosable from run evidence instead of
        // guessed at (live lesson: four opaque failures on one criterion).
        const coverage = content.testFiles
          .map(
            (file) =>
              `${file.path}[${file.visibility}]->${file.coveredCriterionIds.join("+")}`,
          )
          .join(" ");
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} | model coverage: ${coverage}`,
        );
      }
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
