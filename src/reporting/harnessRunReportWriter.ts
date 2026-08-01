import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessRunReport } from "./harnessRunReport.js";

export async function writeHarnessRunReport(
  report: HarnessRunReport,
  runsDirectory = "runs",
): Promise<string> {
  await mkdir(runsDirectory, { recursive: true });
  const path = join(runsDirectory, `report-${report.reportId}.json`);
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}
