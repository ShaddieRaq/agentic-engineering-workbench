import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { AgentApplicationService } from "./agents/agentApplicationService.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import {
  parseFoundryArgs,
  type FoundryCliAnswer,
} from "./cli/parseFoundryArgs.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import {
  IntakeSessionController,
  type IntakeTurnResult,
} from "./foundry/intakeSessionController.js";
import { intakeOperatorAnswerSchema } from "./foundry/intakeTurnInput.js";
import { ProjectBriefService } from "./foundry/projectBriefService.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";
import { FileWorkspaceStore } from "./workspaces/fileWorkspaceStore.js";

const answersFileSchema = z.array(intakeOperatorAnswerSchema).min(1).max(50);

function createIntakeController(model: string | null): IntakeSessionController {
  const workspaceRoot = process.cwd();
  const workspaces = new FileWorkspaceStore(
    resolve(workspaceRoot, ".workbench", "workspaces.json"),
    workspaceRoot,
  );
  const apiKey = process.env.OPENAI_API_KEY;
  const agentService = new AgentApplicationService(
    platformAgentRegistry,
    new FileArtifactStore(),
    workspaces,
    createPlatformToolRegistry,
    (requestedModel) => {
      if (!apiKey) throw new Error("OPENAI_API_KEY is missing from .env");
      return new OpenAIProvider(apiKey, { model: requestedModel });
    },
  );
  const store = new FoundryArtifactStore();

  return new IntakeSessionController({
    agentService,
    briefService: new ProjectBriefService(store),
    store,
    model,
  });
}

async function collectAnswers(
  answers: FoundryCliAnswer[],
  answersFile: string | null,
): Promise<FoundryCliAnswer[]> {
  if (answersFile === null) return answers;
  const parsed = answersFileSchema.parse(
    JSON.parse(await readFile(resolve(process.cwd(), answersFile), "utf8")),
  );
  return [...answers, ...parsed];
}

function renderTurn(result: IntakeTurnResult): void {
  const { brief, record } = result;
  const completedTurns = brief.version - 1;
  console.log(`Brief: ${brief.briefId} (version ${brief.version})`);
  console.log(
    `Turn ${completedTurns}/${record.maxTurns}` +
      (record.turnNumber === completedTurns ? "" : ` (attempt ${record.turnNumber})`) +
      `: ${record.status}`,
  );

  if (record.nextQuestions.length > 0) {
    console.log("Questions:");
    record.nextQuestions.forEach((question, index) => {
      console.log(
        `  ${index + 1}. [${question.intent}] ${question.question}`,
      );
      console.log(`     id: ${question.id}`);
    });
  }

  if (record.openIssues.length > 0) {
    console.log("Open issues:");
    for (const issue of record.openIssues) {
      console.log(`  [${issue.severity}] ${issue.description}`);
    }
  }

  if (result.reconciliation) {
    const { remintedEntries, removedReferences, droppedQuestionIds } =
      result.reconciliation;
    console.log(
      "Structural repairs applied: " +
        `${remintedEntries.length} re-minted id(s), ` +
        `${removedReferences.length} removed reference(s), ` +
        `${droppedQuestionIds.length} dropped question(s).`,
    );
  }

  if (record.status === "ready-for-decision") {
    console.log(
      `Ready for decision: npm run foundry -- brief-decide --brief-id ${brief.briefId} --version ${brief.version} ...`,
    );
  }
  if (record.status === "awaiting-answers") {
    console.log(
      `Answer with: npm run foundry -- intake-turn --brief-id ${brief.briefId} --answer "<questionId>=<text>"`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseFoundryArgs(process.argv.slice(2));
  const store = new FoundryArtifactStore();
  const service = new ProjectBriefService(store);

  if (args.command === "brief-create") {
    const saved = await service.initiateBrief({
      title: args.title,
      ideaSummary: args.idea,
    });
    console.log(JSON.stringify({ brief: saved.brief, reference: saved.reference }, null, 2));
    return;
  }

  if (args.command === "brief-show") {
    const brief = await service.loadBrief(args.briefId, args.version ?? undefined);
    const status = await service.deriveBriefStatus(args.briefId);
    console.log(JSON.stringify({ brief, status }, null, 2));
    return;
  }

  if (args.command === "brief-list") {
    const versions = args.briefId
      ? await service.listBriefVersions(args.briefId)
      : (await store.list({ kind: "project-brief" })).artifacts;
    console.log(JSON.stringify(versions, null, 2));
    return;
  }

  if (args.command === "brief-lineage") {
    const report = await service.verifyLineage(args.briefId);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (args.command === "brief-decide") {
    const saved = await service.recordDecision({
      briefId: args.briefId,
      version: args.version,
      decision: args.decision,
      operatorId: args.operatorId,
      rationale: args.rationale,
      requestedRevisions:
        args.requestedRevisions.length > 0 ? args.requestedRevisions : null,
    });
    console.log(JSON.stringify({ decision: saved.decision, reference: saved.reference }, null, 2));
    return;
  }

  if (args.command === "intake-start") {
    const controller = createIntakeController(args.model);
    const result = await controller.startIntake({
      title: args.title,
      idea: args.idea,
      ...(args.maxTurns !== null ? { maxTurns: args.maxTurns } : {}),
    });
    renderTurn(result);
    return;
  }

  if (args.command === "intake-turn") {
    const controller = createIntakeController(args.model);
    const result = await controller.runTurn({
      briefId: args.briefId,
      answers: await collectAnswers(args.answers, args.answersFile),
    });
    renderTurn(result);
    return;
  }

  if (args.command === "intake-status") {
    const controller = createIntakeController(null);
    const report = await controller.status(args.briefId);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (
    args.command === "architect-plan" ||
    args.command === "plan-show" ||
    args.command === "plan-decide"
  ) {
    const { ArchitectService } = await import("./foundry/architectService.js");
    const workspaceRoot = process.cwd();
    const workspaces = new FileWorkspaceStore(
      resolve(workspaceRoot, ".workbench", "workspaces.json"),
      workspaceRoot,
    );
    const apiKey = process.env.OPENAI_API_KEY;
    const agentService = new AgentApplicationService(
      platformAgentRegistry,
      new FileArtifactStore(),
      workspaces,
      createPlatformToolRegistry,
      (requestedModel) => {
        if (!apiKey) throw new Error("OPENAI_API_KEY is missing from .env");
        return new OpenAIProvider(apiKey, { model: requestedModel });
      },
    );
    const architect = new ArchitectService({
      agentService,
      briefService: service,
      store,
    });

    if (args.command === "architect-plan") {
      const saved = await architect.createPlan({
        briefId: args.briefId,
        ...(args.model ? { model: args.model } : {}),
      });
      console.log(`Plan: ${saved.plan.planId} (brief ${saved.plan.briefId} v${saved.plan.briefVersion})`);
      console.log(
        `Components: ${saved.plan.content.components.length}, ` +
          `slices: ${saved.plan.content.implementationSlices.length}, ` +
          `acceptance mappings: ${saved.plan.content.acceptancePlan.length}, ` +
          `concerns: ${saved.plan.content.concerns.length}`,
      );
      if (saved.plan.reconciliation) {
        console.log(
          `Structural repairs applied: ${saved.plan.reconciliation.removedReferences.length} removed reference(s).`,
        );
      }
      console.log(`Evidence saved: ${saved.reference.path}`);
      return;
    }

    if (args.command === "plan-show") {
      const plan = await architect.loadPlan(args.planId);
      const status = await architect.derivePlanStatus(args.planId);
      console.log(JSON.stringify({ plan, status }, null, 2));
      return;
    }

    const saved = await architect.recordPlanDecision({
      planId: args.planId,
      decision: args.decision,
      operatorId: args.operatorId,
      rationale: args.rationale,
      requestedRevisions:
        args.requestedRevisions.length > 0 ? args.requestedRevisions : null,
    });
    console.log(JSON.stringify({ decision: saved.decision, reference: saved.reference }, null, 2));
    return;
  }

  if (args.command === "export-claude-code") {
    const { writeClaudeCodeIntakeExport } = await import(
      "./foundry/exporters/claudeCodeIntakeExporter.js"
    );
    const result = await writeClaudeCodeIntakeExport({
      decisionArtifactId: args.decisionArtifactId,
      outputDirectory: args.out ?? "exports/claude-code/project-intake",
    });
    console.log(
      `Exported ${result.manifest.subject.agentId}@${result.manifest.subject.agentVersion} for Claude Code.`,
    );
    for (const path of result.createdPaths) console.log(`Created: ${path}`);
    console.log(
      "Next: copy the package into ~/.claude/skills/project-intake and run a real interview; return the feedback bundle to the Workbench.",
    );
    return;
  }

  const { importExportFeedback } = await import("./foundry/exportFeedback.js");
  const exportDir = args.exportDir ?? "exports/claude-code/project-intake";
  const bundle: unknown = JSON.parse(
    await readFile(resolve(process.cwd(), args.bundlePath), "utf8"),
  );
  const provenance: unknown = JSON.parse(
    await readFile(resolve(process.cwd(), exportDir, "provenance.json"), "utf8"),
  );
  const record = importExportFeedback({ bundle, provenance });
  const reference = await store.saveExportFeedback(record);
  console.log(
    `Imported feedback ${record.feedbackId} for export ${record.exportId} ` +
      `(${record.subject.agentId}@${record.subject.agentVersion}, provenance verified).`,
  );
  console.log(`Evidence saved: ${reference.path}`);
  if (record.bundle.issuesObserved.length > 0) {
    console.log("Issues observed:");
    for (const issue of record.bundle.issuesObserved) console.log(`  - ${issue}`);
  }
  if (record.bundle.observations.length > 0) {
    console.log("Observations:");
    for (const note of record.bundle.observations) console.log(`  - ${note}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
