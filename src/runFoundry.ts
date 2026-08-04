import { parseFoundryArgs } from "./cli/parseFoundryArgs.js";
import { FoundryArtifactStore } from "./foundry/foundryArtifactStore.js";
import { ProjectBriefService } from "./foundry/projectBriefService.js";

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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
