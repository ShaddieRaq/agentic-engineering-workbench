import "dotenv/config";
import { basename, join } from "node:path";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { loadHarnessRun } from "./reporting/harnessRunLoader.js";
import { replayHarnessRun } from "./reporting/harnessRunReplay.js";
import { writeHarnessRunReplay } from "./reporting/harnessRunReplayWriter.js";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const args = process.argv.slice(2);
  const runPath = option(args, "--run");

  if (!runPath) {
    throw new Error("Missing required --run argument");
  }

  const model = option(args, "--model") ?? "gpt-5.4-mini";
  const runsDirectory = join(process.cwd(), "runs");
  const source = await loadHarnessRun(basename(runPath), {
    allowedRoot: runsDirectory,
  });
  const replay = await replayHarnessRun(
    source,
    new OpenAIProvider(apiKey, { model }),
  );
  const evidencePath = await writeHarnessRunReplay(replay);

  console.log(`Source run: ${source.runId}`);
  console.log(`Replay run: ${replay.replayRun.runId}`);
  console.log(`Outcome: ${replay.comparison.outcome}`);
  console.log(`Policy changed: ${replay.comparison.policyChanged}`);
  console.log(`Evidence saved: ${evidencePath}`);

  if (!replay.replayRun.passed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Replay failed:", error);
  process.exit(1);
});
