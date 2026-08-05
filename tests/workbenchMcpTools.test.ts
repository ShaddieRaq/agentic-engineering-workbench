import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import {
  agentPromotionDecisionSchema,
  type AgentPromotionDecision,
} from "../src/agents/evaluations/agentPromotionDecision.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { projectIntakeBaselinePolicy } from "../src/agents/projectIntake/projectIntakePolicy.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { createProjectIntakeExport } from "../src/foundry/agentExport.js";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { createInitialProjectBrief } from "../src/foundry/projectBrief.js";
import { createWorkbenchMcpTools } from "../src/mcp/workbenchMcpTools.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

async function createTools() {
  const runsDirectory = await mkdtemp(join(tmpdir(), "mcp-runs-"));
  const foundryDirectory = await mkdtemp(join(tmpdir(), "mcp-foundry-"));
  const exportsRoot = await mkdtemp(join(tmpdir(), "mcp-exports-"));
  createdDirectories.push(runsDirectory, foundryDirectory, exportsRoot);

  const foundry = new FoundryArtifactStore(foundryDirectory);
  const tools = createWorkbenchMcpTools({
    agents: platformAgentRegistry,
    artifacts: new FileArtifactStore(runsDirectory),
    foundry,
    exportsRoot,
  });
  return { tools, foundry, exportsRoot };
}

function approvedDecision(): AgentPromotionDecision {
  const policyDigest = digestJsonEvidence(projectIntakeBaselinePolicy);
  const candidateId = randomUUID();
  return agentPromotionDecisionSchema.parse({
    decisionId: randomUUID(),
    decision: "approve",
    candidateEvaluationArtifactId: "candidate-evaluation-1",
    proposalArtifactId: "proposal-1",
    subject: {
      agentId: "project-intake",
      agentVersion: "0.3.0",
      manifestDigest: "a".repeat(64),
    },
    candidate: {
      subjectAgentId: "project-intake",
      baseVersion: "0.3.0",
      candidateId,
      proposalId: "proposal-1",
      baselinePolicyDigest: "b".repeat(64),
      effectivePolicyDigest: policyDigest,
    },
    planId: randomUUID(),
    planDigest: "c".repeat(64),
    gatesPassed: true,
    operatorId: "operator-1",
    rationale: "All gates passed.",
    releaseTask: {
      kind: "source-controlled-agent-release",
      subjectAgentId: "project-intake",
      baseVersion: "0.3.0",
      candidateId,
      proposalId: "proposal-1",
      effectivePolicyDigest: policyDigest,
      requiredActions: ["Apply the approved policy."],
    },
    decidedAt: new Date().toISOString(),
  });
}

function bundleJsonFor(manifest: ReturnType<typeof createProjectIntakeExport>) {
  return JSON.stringify({
    exportIdentity: {
      agentId: manifest.subject.agentId,
      agentVersion: manifest.subject.agentVersion,
      policyDigest: manifest.subject.policyDigest,
      exportId: manifest.exportId,
    },
    sessionDate: "2026-08-04",
    turnCount: 1,
    finalBriefVersion: 1,
    finalBrief: {
      title: "Example",
      ideaSummary: "An example idea.",
      goals: [],
      users: [],
      constraints: [],
      risks: [],
      nonGoals: [],
      assumptions: [],
      acceptanceCriteria: [],
      openQuestions: [],
    },
    issuesObserved: ["A reported issue."],
    observations: [],
  });
}

describe("workbench MCP tools", () => {
  it("lists and describes registered agents", async () => {
    const { tools } = await createTools();
    const agents = await tools.listAgents();

    expect(agents).toHaveLength(7);
    expect(agents).toContainEqual(
      expect.objectContaining({ id: "project-intake", version: "0.3.0" }),
    );

    const manifest = await tools.describeAgent({ agentId: "project-intake" });
    expect(manifest.permissions.toolIds).toEqual([]);

    await expect(tools.describeAgent({ agentId: "ghost" })).rejects.toThrowError();
  });

  it("lists and loads foundry artifacts", async () => {
    const { tools, foundry } = await createTools();
    const brief = createInitialProjectBrief({
      title: "Example",
      ideaSummary: "An example idea.",
    });
    await foundry.saveProjectBrief(brief);

    const listed = await tools.listArtifacts({
      source: "foundry",
      kind: "project-brief",
    });
    expect(listed.artifacts).toHaveLength(1);

    const loaded = await tools.getArtifact({
      source: "foundry",
      artifactId: `${brief.briefId}-v1`,
    });
    expect(loaded.kind).toBe("project-brief");
  });

  it("submits a feedback bundle verified against provenance", async () => {
    const { tools, foundry, exportsRoot } = await createTools();
    const manifest = createProjectIntakeExport({ decision: approvedDecision() });
    const packageDirectory = join(exportsRoot, "claude-code/project-intake");
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      join(packageDirectory, "provenance.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    const result = await tools.submitFeedback({
      bundleJson: bundleJsonFor(manifest),
    });

    expect(result.provenanceVerified).toBe(true);
    expect(result.issuesObserved).toEqual(["A reported issue."]);
    const listed = await foundry.list({ kind: "export-feedback" });
    expect(listed.artifacts).toHaveLength(1);
  });

  it("rejects a feedback bundle whose identity does not match provenance", async () => {
    const { tools, exportsRoot } = await createTools();
    const manifest = createProjectIntakeExport({ decision: approvedDecision() });
    const other = createProjectIntakeExport({ decision: approvedDecision() });
    const packageDirectory = join(exportsRoot, "claude-code/project-intake");
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      join(packageDirectory, "provenance.json"),
      JSON.stringify(other, null, 2),
      "utf8",
    );

    await expect(
      tools.submitFeedback({ bundleJson: bundleJsonFor(manifest) }),
    ).rejects.toThrowError(/does not match provenance export/i);

    await expect(
      tools.submitFeedback({ bundleJson: "not json" }),
    ).rejects.toThrowError();
  });

  it("serves the approved export package files", async () => {
    const { tools, exportsRoot } = await createTools();
    const packageDirectory = join(exportsRoot, "claude-code/project-intake");
    await mkdir(join(packageDirectory, "references"), { recursive: true });
    await writeFile(join(packageDirectory, "SKILL.md"), "skill content", "utf8");
    await writeFile(
      join(packageDirectory, "references", "feedback-bundle.md"),
      "bundle contract",
      "utf8",
    );

    const result = await tools.getApprovedExport({
      agentId: "project-intake",
      target: "claude-code",
    });
    expect(result.files.map(({ relativePath }) => relativePath)).toEqual([
      "SKILL.md",
      "references/feedback-bundle.md",
    ]);
    expect(result.files[0]?.content).toBe("skill content");

    await expect(
      tools.getApprovedExport({ agentId: "ghost", target: "claude-code" }),
    ).rejects.toThrowError(/no approved claude-code export/i);
  });
});
