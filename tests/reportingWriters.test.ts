import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HarnessRunReplayResult } from "../src/reporting/harnessRunReplay.js";
import { writeHarnessRunReplay } from "../src/reporting/harnessRunReplayWriter.js";
import { summarizeHarnessRuns } from "../src/reporting/harnessRunReport.js";
import { writeHarnessRunReport } from "../src/reporting/harnessRunReportWriter.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("reporting writers", () => {
  it("persists replay and aggregate report artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "reporting-"));
    temporaryDirectories.push(directory);
    const replay = {
      replayId: "replay-1",
      sourceRun: { runId: "source" },
      replayRun: { runId: "replay" },
      comparison: {
        outcome: "unchanged",
        policyChanged: false,
        evaluations: [],
      },
      completedAt: "2026-08-01T12:00:00.000Z",
    } as unknown as HarnessRunReplayResult;
    const report = summarizeHarnessRuns([]);

    const replayPath = await writeHarnessRunReplay(replay, directory);
    const reportPath = await writeHarnessRunReport(report, directory);

    expect(JSON.parse(await readFile(replayPath, "utf8"))).toEqual(replay);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(report);
  });
});
