import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agents/agentRunner.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import {
  testDesignerBaselinePolicy,
  testDesignerPolicySchema,
} from "../src/agents/testDesigner/testDesignerPolicy.js";
import { buildTestDesignerPrompt } from "../src/agents/testDesigner/testDesignerPrompt.js";
import type { TestSuiteContentShape } from "../src/foundry/testSuite.js";
import type { AIProvider } from "../src/providers/aiProvider.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { suiteContentFor, suiteFixtures } from "./testSuite.test.js";

function scriptedProvider(
  output: TestSuiteContentShape | null,
  refusal: string | null = null,
): AIProvider {
  return {
    async generate<TOutput>() {
      return {
        rawOutput: "scripted test suite",
        parsedOutput: output as TOutput | null,
        refusal,
        provider: { model: "fake-test-designer-model", usage: null },
      };
    },
  };
}

describe("testDesignerAgent", () => {
  it("is registered with an instructions revision surface", () => {
    const registration = platformAgentRegistry.get("test-designer");
    expect(registration.manifest.version).toBe("0.3.0");
    expect(registration.manifest.permissions.toolIds).toEqual([]);
    expect(registration.revisionSurface?.mutableFields).toEqual(["instructions"]);
    expect(
      testDesignerPolicySchema.parse(testDesignerBaselinePolicy),
    ).toEqual(testDesignerBaselinePolicy);
  });

  it("produces a validated suite through the shared runner", async () => {
    const { brief, plan } = suiteFixtures();
    const result = await runAgent(
      "test-designer",
      { brief, plan },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(suiteContentFor(brief)),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(true);
    expect(result.assessment?.passed).toBe(true);
    expect(result.output).toMatchObject({ reconciliation: null });
  });

  it("merges untouched prior files into a delta-only evolution output", async () => {
    const { brief, plan } = suiteFixtures();
    const priorSuiteContent = suiteContentFor(brief);
    // The model emits ONLY the delta: one new visible file and one new
    // holdout; every prior file must be carried in verbatim by the merge.
    const newCriterionId = brief.acceptanceCriteria[0]!.id;
    const deltaOnly: TestSuiteContentShape = {
      interfaceContract: priorSuiteContent.interfaceContract,
      testFiles: [
        {
          path: "acceptance-tests/evolution-new.test.ts",
          content: priorSuiteContent.testFiles[0]!.content,
          visibility: "visible",
          coveredCriterionIds: [newCriterionId],
          testType: "integration",
        },
        {
          path: "acceptance-tests/evolution-holdout.test.ts",
          content: priorSuiteContent.testFiles[0]!.content,
          visibility: "holdout",
          coveredCriterionIds: [newCriterionId],
          testType: "integration",
        },
      ],
      manualChecks: [],
      concerns: [],
    };
    const result = await runAgent(
      "test-designer",
      {
        brief,
        plan,
        evolution: {
          priorSuiteContent,
          requiredHoldoutCount: 1,
          unchangedCriterionIds: brief.acceptanceCriteria.map(({ id }) => id),
          changedCriterionIds: [],
          newCriterionIds: [newCriterionId],
          retiredCriterionIds: [],
        },
      },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(deltaOnly),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(true);
    const output = result.output as TestSuiteContentShape;
    const paths = output.testFiles.map(({ path }) => path);
    for (const prior of priorSuiteContent.testFiles) {
      expect(paths).toContain(prior.path);
      const merged = output.testFiles.find(({ path }) => path === prior.path);
      expect(merged?.content).toBe(prior.content);
    }
    expect(paths).toContain("acceptance-tests/evolution-new.test.ts");
    expect(paths).toContain("acceptance-tests/evolution-holdout.test.ts");
  });

  it("fails the run on holdout-only coverage", async () => {
    const { brief, plan } = suiteFixtures();
    const content = suiteContentFor(brief);
    for (const file of content.testFiles) file.visibility = "holdout";

    const result = await runAgent(
      "test-designer",
      { brief, plan },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(content),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(false);
    expect(result.failure?.message).toMatch(/not covered by any visible test/i);
  });

  it("fails the run on syntax errors", async () => {
    const { brief, plan } = suiteFixtures();
    const content = suiteContentFor(brief);
    content.testFiles[0]!.content = "it(broken";

    const result = await runAgent(
      "test-designer",
      { brief, plan },
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider: scriptedProvider(content),
        workspaceRoot: "/workspace",
      },
    );

    expect(result.succeeded).toBe(false);
    expect(result.failure?.message).toMatch(/syntax error/i);
  });

  it("threads policy changes into the prompt", () => {
    const { brief, plan } = suiteFixtures();
    const patched = testDesignerPolicySchema.parse({
      instructions: {
        ...testDesignerBaselinePolicy.instructions,
        testRules: [
          ...testDesignerBaselinePolicy.instructions.testRules,
          "Prefer table-driven cases when a criterion has many boundaries.",
        ],
      },
    });

    expect(buildTestDesignerPrompt(brief, plan, patched)).toContain(
      "table-driven cases",
    );
    expect(buildTestDesignerPrompt(brief, plan)).not.toContain(
      "table-driven cases",
    );
  });

  it("appends the revision section when a revision context is provided", () => {
    const { brief, plan } = suiteFixtures();
    const withRevision = buildTestDesignerPrompt(brief, plan, undefined, {
      previous: { interfaceContract: "the prior contract" },
      requestedRevisions: ["Import every Vitest hook used."],
    });
    expect(withRevision).toContain("REVISION REQUEST:");
    expect(withRevision).toContain("the prior contract");
    expect(withRevision).toContain("- Import every Vitest hook used.");
    expect(buildTestDesignerPrompt(brief, plan)).not.toContain(
      "REVISION REQUEST:",
    );
  });
});
