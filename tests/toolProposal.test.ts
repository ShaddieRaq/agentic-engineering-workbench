import { describe, expect, it } from "vitest";
import type { AIProvider } from "../src/providers/aiProvider.js";
import {
  evaluateToolProposal,
  runToolProposal,
  type ToolProposalOutput,
} from "../src/agents/toolBuilder/toolProposal.js";

function safeProposal(): ToolProposalOutput {
  return {
    disposition: "propose",
    title: "Bounded JSON reader",
    summary: "Read and validate one bounded JSON file.",
    rationale: "The capability can be implemented as a read-only bounded tool.",
    contract: {
      id: "read-json",
      description: "Read a bounded JSON file under the configured workspace.",
      readOnly: true,
      sideEffects: [],
      inputFields: [{
        name: "path",
        type: "string",
        required: true,
        description: "Repository-relative JSON path.",
        limits: ["Must remain under the configured root."],
      }],
      outputFields: [{
        name: "value",
        type: "JSONValue",
        required: true,
        description: "Validated JSON value.",
        limits: ["Must be JSON-serializable."],
      }],
      limits: ["Maximum 32,768 bytes."],
      failureModes: ["Permission denial", "Invalid JSON"],
    },
    files: [
      {
        path: "src/tools/readJsonTool.ts",
        purpose: "Tool implementation and schemas.",
        content: "export const readJsonTool = true;",
      },
      {
        path: "tests/readJsonTool.test.ts",
        purpose: "Tool contract and boundary tests.",
        content: "it('tests the tool', () => {});",
      },
    ],
    registrationChanges: [{
      path: "src/tools/toolRegistry.ts",
      description: "Register createReadJsonTool with the platform catalog.",
    }],
    verificationCommands: [
      "npm run typecheck",
      "npm test -- tests/readJsonTool.test.ts",
    ],
    clarifyingQuestions: [],
    securityNotes: ["The application owns the allowed workspace root."],
  };
}

describe("evaluateToolProposal", () => {
  it("accepts a bounded read-only implementation proposal", () => {
    expect(evaluateToolProposal(safeProposal(), false)).toEqual({
      passed: true,
      issues: [],
      message: "The generated proposal satisfies the Tool Builder policy.",
    });
  });

  it("rejects unapproved side effects and unsafe generated paths", () => {
    const proposal = safeProposal();
    proposal.contract = {
      ...proposal.contract!,
      readOnly: false,
      sideEffects: ["Deletes files."],
    };
    proposal.files[0]!.path = "../outside.ts";

    const evaluation = evaluateToolProposal(proposal, false);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.issues).toEqual([
      "Generated path is outside the permitted proposal roots: ../outside.ts",
      "The proposal includes side effects that were not authorized.",
      "A proposed tool requires an implementation file under src/tools/.",
    ]);
  });

  it("accepts a code-free security rejection", () => {
    const proposal: ToolProposalOutput = {
      disposition: "reject",
      title: "Unrestricted shell",
      summary: "The request cannot be safely bounded.",
      rationale: "Arbitrary shell execution would bypass tool permissions.",
      contract: null,
      files: [],
      registrationChanges: [],
      verificationCommands: [],
      clarifyingQuestions: [],
      securityNotes: ["Do not expose unrestricted shell execution."],
    };

    expect(evaluateToolProposal(proposal, false).passed).toBe(true);
  });
});

describe("runToolProposal", () => {
  it("preserves structured provider and policy evidence", async () => {
    const proposal = safeProposal();
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured proposal",
          parsedOutput: proposal as TOutput,
          refusal: null,
          provider: { model: "fake-tool-builder", usage: null },
        };
      },
    };

    const result = await runToolProposal(provider, {
      request: "Create a bounded JSON reader.",
      targetToolId: "read-json",
      allowSideEffects: false,
      additionalConstraints: [],
    });

    expect(result).toMatchObject({
      succeeded: true,
      parsedOutput: { disposition: "propose", contract: { id: "read-json" } },
      provider: { model: "fake-tool-builder" },
      policyEvaluation: { passed: true },
    });
  });
});
