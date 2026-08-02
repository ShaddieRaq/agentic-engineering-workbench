import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AgentApplicationService } from "./agents/agentApplicationService.js";
import { assertAgentCatalogValid } from "./agents/agentCatalogValidator.js";
import { scaffoldAgent } from "./agents/agentScaffolder.js";
import { platformAgentRegistry } from "./agents/platformAgentRegistry.js";
import { FileArtifactStore } from "./artifacts/fileArtifactStore.js";
import { parseAgentArgs } from "./cli/parseAgentArgs.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { createPlatformToolRegistry } from "./tools/toolRegistry.js";
import { FileWorkspaceStore } from "./workspaces/fileWorkspaceStore.js";

async function readInput(path: string | null): Promise<unknown> {
  if (path === null) return {};
  return JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
}

async function main(): Promise<void> {
  const args = parseAgentArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();
  const workspaces = new FileWorkspaceStore(
    resolve(workspaceRoot, ".workbench", "workspaces.json"),
    workspaceRoot,
  );
  const tools = createPlatformToolRegistry(workspaceRoot);
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

  if (args.command === "list") {
    for (const manifest of service.listAgents()) {
      console.log(
        `${manifest.id}\t${manifest.version}\t${manifest.status}\t${manifest.description}`,
      );
    }
    return;
  }

  if (args.command === "describe") {
    console.log(
      JSON.stringify(service.describeAgent(args.agentId).manifest, null, 2),
    );
    return;
  }

  if (args.command === "validate") {
    assertAgentCatalogValid(platformAgentRegistry, tools);
    console.log(
      `Agent catalog valid: ${platformAgentRegistry.list().length} agent(s).`,
    );
    return;
  }

  if (args.command === "inventory") {
    console.log(
      JSON.stringify(service.inventory(), null, 2),
    );
    return;
  }

  if (args.command === "scaffold") {
    const result = await scaffoldAgent(args.agentId);
    console.log(`Agent scaffold created: ${result.agentId}`);
    for (const path of result.createdPaths) console.log(`Created: ${path}`);
    for (const step of result.nextSteps) console.log(`Next: ${step}`);
    return;
  }

  const registration = platformAgentRegistry.get(args.agentId);
  const model = args.model ?? registration.manifest.defaultModel;

  if (args.command === "test") {
    const datasetIds = registration.manifest.verification.datasetIds;

    if (datasetIds.length === 0) {
      throw new Error(`Agent ${args.agentId} has no verification datasets.`);
    }

    let passed = true;
    const result = await service.verify({
      agentId: args.agentId,
      repetitions: args.repetitions,
      concurrency: args.concurrency,
      model,
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    });

    for (const item of result.datasets) {
      const { datasetRun: result, verification, artifactPath: evidencePath } = item;
      passed = passed && verification.passed;

      console.log(`Dataset: ${result.datasetId}`);
      console.log(`Verification: ${verification.passed ? "passed" : "failed"}`);
      console.log(`Evidence saved: ${evidencePath}`);

      for (const summary of result.caseSummaries) {
        console.log(
          `Case [${summary.datasetCaseId}]: ${summary.passedRuns}/${summary.totalRuns} passed`,
        );
      }
    }

    console.log(`Experiment: ${result.experiment.experimentId}`);
    console.log(`Experiment evidence saved: ${result.artifactPath}`);

    if (!passed) process.exitCode = 1;
    return;
  }

  const { run: result, artifactPath: evidencePath } = await service.run({
    agentId: args.agentId,
    input: await readInput(args.inputPath),
    model,
    ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
  });

  console.log(`Agent: ${result.agentId}@${result.agentVersion}`);
  console.log(`Status: ${result.succeeded ? "succeeded" : "failed"}`);
  console.log(`Evidence saved: ${evidencePath}`);

  if (result.output && typeof result.output === "object") {
    const overview = (result.output as Record<string, unknown>).overview;
    if (typeof overview === "string") console.log(`Overview: ${overview}`);
  }

  if (result.failure) {
    console.log(`Failure [${result.failure.stage}]: ${result.failure.message}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Agent command failed:", error);
  process.exit(1);
});
