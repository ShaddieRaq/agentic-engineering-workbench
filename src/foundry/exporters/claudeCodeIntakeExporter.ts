import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FileArtifactStore } from "../../artifacts/fileArtifactStore.js";
import {
  createProjectIntakeExport,
  type AgentExportManifest,
} from "../agentExport.js";

function bulleted(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

export function renderIntakeSkillMarkdown(manifest: AgentExportManifest): string {
  const { instructions } = manifest;
  return `---
name: project-intake
description: Interview a software idea into a decision-ready project brief. Use when the user wants to interview a software idea, create a project brief, or run an intake interview before building anything.
---

# Project Intake Interviewer

## Provenance

Exported from the Agentic Engineering Workbench as a standalone agent.

- Agent: ${manifest.subject.agentId}@${manifest.subject.agentVersion}
- Approved by promotion decision ${manifest.approval.decisionArtifactId} (all promotion gates passed)
- Policy digest: ${manifest.subject.policyDigest}
- Export: ${manifest.exportId} (${manifest.exportedAt})

Never modify this skill package by hand. Behavior changes must go through the
Workbench improvement loop and a re-export.

## Role

${instructions.roleLines.join("\n")}

## Brief rules

${bulleted(instructions.briefRules)}

## Question rules

${bulleted(instructions.questionRules)}

## Task each turn

${bulleted(instructions.taskLines)}

## Host discipline (Claude Code)

These rules adapt the agent to Claude Code. They add operating structure and
never alter the approved behavior above.

- Maintain the brief as versioned JSON artifacts in the working project:
  \`project-brief/brief-v1.json\`, \`project-brief/brief-v2.json\`, and so on.
  Write a complete new version file after every turn; never edit an existing
  version file.
- Each brief version must conform to \`references/project-brief.schema.json\`
  in this skill package.
- Conduct the interview in batched turns: ask your questions for the turn,
  wait for the user's answers, then produce the next brief version.
- The "required JSON structure" for a complete turn (updatedBriefDraft,
  nextQuestions with intents and targetEntryIds, openIssues) is defined in
  \`references/turn-output.schema.json\`; each brief version file contains the
  \`updatedBriefDraft\` portion of that structure.
- Track the turn number across the session. Stop and present the brief for the
  user's approve/revise decision when there are no unresolved entries, no open
  questions, and no blocking issues.
- Never write application code and never begin implementation. This skill's
  job ends at an approved project brief.
- Never modify this skill package, its instructions, or its scope. If these
  instructions prove inadequate, record the shortcoming for the feedback
  bundle instead of improvising new policy.

## Feedback bundle

When the interview concludes, or whenever the user asks, write
\`${manifest.feedbackBundle.fileName}\` next to the brief artifacts following
\`references/feedback-bundle.md\`. Copy the export identity exactly from
\`provenance.json\`. The user returns that file to the Workbench so real usage
becomes evaluation evidence.
`;
}

export function renderFeedbackReference(manifest: AgentExportManifest): string {
  return `# Feedback bundle contract (format version ${manifest.feedbackBundle.formatVersion})

Write \`${manifest.feedbackBundle.fileName}\` as a single JSON object with all
of these fields:

- \`exportIdentity\`: copy the \`subject\` and \`exportId\` values verbatim from
  \`provenance.json\` (agentId, agentVersion, policyDigest, exportId).
- \`sessionDate\`: ISO date of the interview session.
- \`turnCount\`: number of completed interview turns.
- \`finalBriefVersion\`: the highest brief version number produced.
- \`finalBrief\`: the complete content of the final brief version file.
- \`issuesObserved\`: array of strings; every instruction shortcoming, schema
  friction, or confusing moment observed during the session. Empty array if none.
- \`observations\`: array of strings; anything else worth returning to the
  Workbench (question quality, user reactions, ideas). Empty array if none.

Do not include secrets, credentials, or employer-confidential material in the
bundle. The bundle is evaluation evidence, not a transcript: summarize, cite
brief entries by id where useful, and keep it reviewable.
`;
}

export function renderReadme(manifest: AgentExportManifest): string {
  return `# project-intake ${manifest.subject.agentVersion} — Claude Code skill

A standalone export of the Workbench's Project Intake agent: it interviews a
software idea into a decision-ready, provenance-tracked project brief. It never
writes code.

## Install

Copy this directory into your Claude Code skills folder:

\`\`\`bash
cp -r . ~/.claude/skills/project-intake        # user-wide
# or
cp -r . <project>/.claude/skills/project-intake  # single project
\`\`\`

Then invoke it in a Claude Code session: "interview my software idea" or
\`/project-intake\`.

## What it produces

- \`project-brief/brief-v{N}.json\` — one complete brief per interview turn
- \`${manifest.feedbackBundle.fileName}\` — a feedback bundle to return to the
  Workbench (see \`references/feedback-bundle.md\`)

## Provenance

See \`provenance.json\`. This package was generated from approved evaluation
evidence (decision ${manifest.approval.decisionArtifactId}); it must not be
edited by hand, and it never updates itself.
`;
}

export interface ClaudeCodeExportResult {
  manifest: AgentExportManifest;
  createdPaths: string[];
}

export async function writeClaudeCodeIntakeExport(options: {
  decisionArtifactId: string;
  outputDirectory: string;
  runsDirectory?: string;
}): Promise<ClaudeCodeExportResult> {
  const store = new FileArtifactStore(options.runsDirectory ?? "runs");
  const stored = await store.load(options.decisionArtifactId);
  if (stored.kind !== "agent-promotion-decision") {
    throw new Error(
      `Artifact ${options.decisionArtifactId} is not a promotion decision.`,
    );
  }

  const manifest = createProjectIntakeExport({ decision: stored.artifact });
  if (manifest.turnOutputJsonSchema === undefined) {
    throw new Error("Export manifest is missing the turn output schema.");
  }
  const root = resolve(options.outputDirectory);
  const referencesDirectory = join(root, "references");

  const files: [string, string][] = [
    [join(root, "SKILL.md"), renderIntakeSkillMarkdown(manifest)],
    [join(root, "README.md"), renderReadme(manifest)],
    [join(root, "provenance.json"), JSON.stringify(manifest, null, 2) + "\n"],
    [
      join(referencesDirectory, "project-brief.schema.json"),
      JSON.stringify(manifest.briefContentJsonSchema, null, 2) + "\n",
    ],
    [
      join(referencesDirectory, "turn-output.schema.json"),
      JSON.stringify(manifest.turnOutputJsonSchema, null, 2) + "\n",
    ],
    [
      join(referencesDirectory, "feedback-bundle.md"),
      renderFeedbackReference(manifest),
    ],
  ];

  for (const [path] of files) {
    try {
      await access(path);
      throw new Error(`Export target already exists: ${path}`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  await mkdir(referencesDirectory, { recursive: true });
  const createdPaths: string[] = [];
  for (const [path, content] of files) {
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
    createdPaths.push(path);
  }

  return { manifest, createdPaths };
}
