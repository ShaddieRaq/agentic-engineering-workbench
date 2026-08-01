import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadHarnessRuns } from "./reporting/harnessRunLoader.js";
import { summarizeHarnessRuns } from "./reporting/harnessRunReport.js";
import { writeHarnessRunReport } from "./reporting/harnessRunReportWriter.js";

async function main(): Promise<void> {
  const runsDirectory = join(process.cwd(), "runs");
  const files = (await readdir(runsDirectory))
    .filter((path) => /^run-.+\.json$/.test(path))
    .sort((left, right) => left.localeCompare(right));
  const collection = await loadHarnessRuns(files, {
    allowedRoot: runsDirectory,
  });
  const report = summarizeHarnessRuns(collection.runs, [], {
    acceptedPaths: collection.acceptedPaths,
    rejectedArtifacts: collection.rejectedArtifacts,
  });
  const evidencePath = await writeHarnessRunReport(report);

  console.log(`Runs: ${report.totalRuns}`);
  console.log(`Skipped incompatible artifacts: ${report.sources.rejectedArtifacts.length}`);
  console.log(
    `Passed: ${report.passedRuns}/${report.totalRuns} (${report.passRate === null ? "no evidence" : `${(report.passRate * 100).toFixed(0)}%`})`,
  );
  console.log(`Models: ${JSON.stringify(report.models)}`);
  console.log(`Estimated cost: ${report.usage.estimatedCostUsd === null ? "unavailable" : `$${report.usage.estimatedCostUsd.toFixed(6)}`}`);
  console.log(`Evidence saved: ${evidencePath}`);
}

main().catch((error: unknown) => {
  console.error("Report failed:", error);
  process.exit(1);
});
