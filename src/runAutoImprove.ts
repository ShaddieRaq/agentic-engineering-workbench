import "dotenv/config";
import { resolve } from "node:path";
import { AgentApplicationService } from "./agents/agentApplicationService.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";
import { FileWorkspaceStore } from "./workspaces/fileWorkspaceStore.js";
import { runAgentModelMatrix } from "./agents/modelMatrix/agentModelMatrix.js";
import { writeAgentModelMatrix } from "./agents/modelMatrix/agentModelMatrixWriter.js";
import { loadEvaluationFailures } from "./agents/modelMatrix/modelMatrixArtifacts.js";
import { triageModelMatrix } from "./agents/modelMatrix/agentModelMatrixTriage.js";
import { isFloorApprovedModel } from "./agents/modelTierPolicy.js";
import {
  formatAutoImproveResult,
  runAutoImprove,
} from "./agents/autoImprove/agentAutoImprove.js";

function positional(args: string[], index: number, label: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${label}.`);
  }
  return value;
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const agentId = positional(args, 0, "agent ID");
  const models = (option(args, "--models") ?? "gpt-5.4,gpt-5.4-mini")
    .split(",")
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  const repetitions = Number(option(args, "--repetitions") ?? 3);
  const maxCases = Number(option(args, "--max-cases") ?? 1);

  const workspaceRoot = process.cwd();
  const runsDirectory = resolve(workspaceRoot, "runs");
  const workspaces = new FileWorkspaceStore(
    resolve(workspaceRoot, ".workbench", "workspaces.json"),
    workspaceRoot,
  );
  const apiKey = process.env.OPENAI_API_KEY;
  const service = new AgentApplicationService(
    platformAgentRegistry,
    new FileArtifactStore(),
    workspaces,
    createPlatformToolRegistry,
    (model) => {
      if (!apiKey) throw new Error("OPENAI_API_KEY is missing from .env");
      return new OpenAIProvider(apiKey, { model });
    },
  );

  console.log(
    `Auto-improve ${agentId}: matrix over [${models.join(", ")}] at reps=${repetitions} …`,
  );
  const matrix = await runAgentModelMatrix(
    (request) => service.verify(request),
    { agentId, models, repetitions },
  );
  // Persist the matrix so this run's evidence is inspectable (matrix-triage /
  // matrix-report), consistent with the rest of the platform.
  const matrixPath = await writeAgentModelMatrix(matrix);
  const failures = await loadEvaluationFailures(runsDirectory, matrix);
  const triage = triageModelMatrix(matrix, failures);
  console.log(`Matrix evidence saved: ${matrixPath}`);
  console.log(
    `Triage: ${triage.ambiguity.length} ambiguity, ${triage.capabilityDependent.length} capability-dependent.`,
  );

  const strongCell = matrix.cells.find(
    (cell) => cell.status === "ok" && isFloorApprovedModel(cell.model),
  );
  if (!strongCell || strongCell.evaluationArtifactId === null) {
    throw new Error(
      "Auto-improve needs a floor-approved (strong) model in the matrix to source the improvement baseline. Include gpt-5.4 in --models.",
    );
  }

  const result = await runAutoImprove({
    agentId,
    sourceExperimentId: strongCell.evaluationArtifactId,
    ambiguity: triage.ambiguity,
    analyze: (request) => service.analyzeEvaluation(request),
    evaluate: (proposalArtifactId) =>
      service.evaluateImprovementProposal(proposalArtifactId),
    maxCases,
  });

  console.log("");
  console.log(formatAutoImproveResult(result));
  console.log(
    "\nNo decision was recorded — approve or reject any promotable candidate yourself.",
  );
}

main().catch((error: unknown) => {
  console.error("Auto-improve failed:", error);
  process.exit(1);
});
