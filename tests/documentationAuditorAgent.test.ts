import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { documentationAuditorAgent } from "../src/agents/documentationAuditor/documentationAuditorAgent.js";
import type { DocumentationAuditorPolicy } from "../src/agents/documentationAuditor/documentationAuditorPolicy.js";
import { AgentRegistry } from "../src/agents/agentRegistry.js";
import {
  getAgentDatasetDefinition,
} from "../src/agents/datasets/agentDatasetRegistry.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { runAgent } from "../src/agents/agentRunner.js";
import type {
  AIProvider,
  AIProviderRequest,
} from "../src/providers/aiProvider.js";
import { createPlatformToolRegistry } from "../src/tools/toolRegistry.js";

describe("DocumentationAuditor", () => {
  it("registers protected non-regression coverage in released verification", () => {
    expect(documentationAuditorAgent.manifest.verification.datasetIds).toEqual([
      "documentation-auditor-smoke",
      "documentation-auditor-protected",
    ]);
    expect(
      getAgentDatasetDefinition("documentation-auditor-protected"),
    ).toMatchObject({
      agentId: "documentation-auditor",
      purpose: "protected",
      cases: [
        {
          id: "grounded-documentation-audit",
          input: {
            maximumContextFiles: 16,
          },
        },
      ],
    });
  });

  it("audits local documentation through bounded tools and citation validation", async () => {
    const root = await mkdtemp(join(tmpdir(), "documentation-auditor-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.adoc"), "Run npm run old-command.");
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    await writeFile(join(root, "src", "index.ts"), "export const active = true;");
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured audit",
          parsedOutput: {
            overview: "The README contains one stale command.",
            findings: [{
              title: "Unknown command",
              category: "stale",
              severity: "high",
              explanation: "The documented command is absent from package scripts.",
              evidencePaths: ["README.adoc", "package.json"],
              recommendation: "Replace it with a registered command.",
            }],
            coverageGaps: [],
            prioritizedActions: ["Correct the README command."],
          } as TOutput,
          refusal: null,
          provider: { model: "fake", usage: null },
        };
      },
    };
    const result = await runAgent("documentation-auditor", {}, {
      agents: platformAgentRegistry,
      tools: createPlatformToolRegistry(root),
      provider,
      workspaceRoot: root,
      workspaceId: "fixture",
    });
    expect(result).toMatchObject({
      succeeded: true,
      configuration: { workspaceId: "fixture" },
      output: {
        overview: "The README contains one stale command.",
        findings: [{ category: "stale" }],
      },
    });
  });

  it("constructs an in-memory candidate only through validated policy", async () => {
    const surface = documentationAuditorAgent.revisionSurface;
    expect(surface).toBeDefined();
    expect(surface?.mutableFields).toEqual([
      "instructions",
      "contextSelection",
    ]);

    const baseline = structuredClone(
      surface!.baselinePolicy,
    ) as DocumentationAuditorPolicy;
    const candidate = surface!.createCandidate({
      ...baseline,
      instructions: {
        roleLines: ["Candidate documentation-auditor instructions."],
        defaultTaskInstruction: "Run the candidate documentation audit.",
      },
      contextSelection: {
        ...baseline.contextSelection,
        defaultMaximumFiles: 2,
      },
    });

    expect(candidate.manifest).toEqual(documentationAuditorAgent.manifest);
    expect(candidate.manifest.permissions).toEqual({
      toolIds: ["file-inventory", "read-file"],
    });
    expect(candidate.inputSchema.parse({})).toEqual({
      instruction: "Run the candidate documentation audit.",
      maximumContextFiles: 2,
    });
    expect(candidate.revisionSurface?.baselinePolicy).toEqual(
      surface!.baselinePolicy,
    );

    const root = await mkdtemp(join(tmpdir(), "documentation-candidate-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "Current project guidance.");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } }),
    );
    await writeFile(join(root, "src", "index.ts"), "export const active = true;");
    let observedPrompt = "";
    const provider: AIProvider = {
      async generate<TOutput>(request: AIProviderRequest<TOutput>) {
        observedPrompt = request.prompt;
        return {
          rawOutput: "candidate audit",
          parsedOutput: {
            overview: "The supplied documentation is current.",
            findings: [{
              title: "Current guidance",
              category: "accurate",
              severity: "low",
              explanation: "The README is consistent with package metadata.",
              evidencePaths: ["README.md", "package.json"],
              recommendation: "Keep the guidance current.",
            }],
            coverageGaps: [],
            prioritizedActions: [],
          } as TOutput,
          refusal: null,
          provider: { model: "fake", usage: null },
        };
      },
    };
    const result = await runAgent("documentation-auditor", {}, {
      agents: new AgentRegistry([candidate]),
      tools: createPlatformToolRegistry(root),
      provider,
      workspaceRoot: root,
      workspaceId: "fixture",
    });

    expect(result.succeeded).toBe(true);
    expect(observedPrompt).toContain(
      "Candidate documentation-auditor instructions.",
    );
    expect(observedPrompt).toContain(
      "TASK:\nRun the candidate documentation audit.",
    );
  });
});
