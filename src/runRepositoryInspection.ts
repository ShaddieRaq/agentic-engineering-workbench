import {
  createRepositoryInspectionTools,
  runRepositoryInspectionWorkflow,
} from "./workflows/repositoryInspectionWorkflow.js";

async function main(): Promise<void> {
  const tools = createRepositoryInspectionTools({
    allowedRoot: process.cwd(),
  });
  const result = await runRepositoryInspectionWorkflow(tools);

  console.log(JSON.stringify(result, null, 2));

  if (!result.succeeded) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Repository inspection failed:", error);
  process.exit(1);
});
