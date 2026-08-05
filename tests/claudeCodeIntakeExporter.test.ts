import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { digestJsonEvidence } from "../src/agents/agentEvidenceDigest.js";
import {
  agentPromotionDecisionSchema,
  type AgentPromotionDecision,
} from "../src/agents/evaluations/agentPromotionDecision.js";
import { projectIntakeBaselinePolicy } from "../src/agents/projectIntake/projectIntakePolicy.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import {
  agentExportManifestSchema,
  createProjectIntakeExport,
} from "../src/foundry/agentExport.js";
import {
  renderFeedbackReference,
  renderIntakeSkillMarkdown,
  renderReadme,
  writeClaudeCodeIntakeExport,
} from "../src/foundry/exporters/claudeCodeIntakeExporter.js";
import { projectBriefDraftContentSchema } from "../src/foundry/projectBrief.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

function approvedDecision(
  overrides: Partial<AgentPromotionDecision> = {},
): AgentPromotionDecision {
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
    ...overrides,
  });
}

describe("createProjectIntakeExport", () => {
  it("builds a provenance-complete manifest from an approved decision", () => {
    const decision = approvedDecision();
    const manifest = createProjectIntakeExport({ decision });

    expect(agentExportManifestSchema.parse(manifest)).toEqual(manifest);
    expect(manifest.subject.agentId).toBe("project-intake");
    expect(manifest.subject.policyDigest).toBe(
      digestJsonEvidence(projectIntakeBaselinePolicy),
    );
    expect(manifest.approval.decisionArtifactId).toBe(decision.decisionId);
    expect(manifest.instructions).toEqual(
      projectIntakeBaselinePolicy.instructions,
    );
  });

  it("rejects non-approve decisions", () => {
    const revise = agentPromotionDecisionSchema.parse({
      ...approvedDecision(),
      decision: "revise",
      releaseTask: null,
    });

    expect(() => createProjectIntakeExport({ decision: revise })).toThrowError(
      /approved promotion decision/i,
    );
  });

  it("rejects policy drift between approval and export", () => {
    const drifted = approvedDecision();
    const tampered = {
      ...drifted,
      releaseTask: {
        ...drifted.releaseTask!,
        effectivePolicyDigest: "d".repeat(64),
      },
      candidate: {
        ...drifted.candidate,
        effectivePolicyDigest: "d".repeat(64),
      },
    };

    expect(() =>
      createProjectIntakeExport({
        decision: agentPromotionDecisionSchema.parse(tampered),
      }),
    ).toThrowError(/does not match the approved effective/i);
  });

  it("ships a brief JSON schema that reflects the draft content contract", () => {
    const manifest = createProjectIntakeExport({ decision: approvedDecision() });
    const schema = manifest.briefContentJsonSchema as Record<string, unknown>;
    const properties = schema["properties"] as Record<string, unknown>;

    for (const key of [
      "title",
      "ideaSummary",
      "goals",
      "acceptanceCriteria",
      "openQuestions",
    ]) {
      expect(properties[key]).toBeDefined();
    }
  });
});

describe("claude code renderers", () => {
  const manifest = createProjectIntakeExport({ decision: approvedDecision() });

  it("embeds every approved instruction line verbatim in the skill", () => {
    const skill = renderIntakeSkillMarkdown(manifest);
    const { instructions } = manifest;
    for (const line of [
      ...instructions.roleLines,
      ...instructions.briefRules,
      ...instructions.questionRules,
      ...instructions.taskLines,
    ]) {
      expect(skill).toContain(line);
    }
  });

  it("includes host discipline, boundaries, and provenance", () => {
    const skill = renderIntakeSkillMarkdown(manifest);
    expect(skill).toMatch(/^---\nname: project-intake\ndescription: /);
    expect(skill).toContain("project-brief/brief-v1.json");
    expect(skill).toContain("Never write application code");
    expect(skill).toContain("Never modify this skill package");
    expect(skill).toContain(manifest.approval.decisionArtifactId);
    expect(skill).toContain(manifest.subject.policyDigest);
  });

  it("documents the feedback bundle contract and install path", () => {
    expect(renderFeedbackReference(manifest)).toContain("exportIdentity");
    expect(renderFeedbackReference(manifest)).toContain(
      manifest.feedbackBundle.fileName,
    );
    expect(renderReadme(manifest)).toContain("~/.claude/skills/project-intake");
  });
});

describe("writeClaudeCodeIntakeExport", () => {
  it("writes the package from a stored decision and refuses overwrites", async () => {
    const runsDirectory = await mkdtemp(join(tmpdir(), "export-runs-"));
    const outputDirectory = await mkdtemp(join(tmpdir(), "export-out-"));
    createdDirectories.push(runsDirectory, outputDirectory);

    const store = new FileArtifactStore(runsDirectory);
    const decision = approvedDecision();
    await store.saveAgentPromotionDecision(decision);

    const target = join(outputDirectory, "project-intake");
    const result = await writeClaudeCodeIntakeExport({
      decisionArtifactId: decision.decisionId,
      outputDirectory: target,
      runsDirectory,
    });

    expect(result.createdPaths).toHaveLength(5);
    const provenance = JSON.parse(
      await readFile(join(target, "provenance.json"), "utf8"),
    );
    expect(agentExportManifestSchema.parse(provenance).approval.decisionArtifactId).toBe(
      decision.decisionId,
    );
    const briefSchema = JSON.parse(
      await readFile(join(target, "references", "project-brief.schema.json"), "utf8"),
    );
    expect(briefSchema).toEqual(result.manifest.briefContentJsonSchema);

    await expect(
      writeClaudeCodeIntakeExport({
        decisionArtifactId: decision.decisionId,
        outputDirectory: target,
        runsDirectory,
      }),
    ).rejects.toThrowError(/already exists/i);
  });
});

describe("exported schema accepts a real brief draft", () => {
  it("keeps the zod contract as source of truth", () => {
    const draft = {
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
    };
    expect(() => projectBriefDraftContentSchema.parse(draft)).not.toThrow();
  });
});
