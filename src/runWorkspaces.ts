import { resolve } from "node:path";
import { parseWorkspaceArgs } from "./cli/parseWorkspaceArgs.js";
import { FileWorkspaceStore } from "./workspaces/fileWorkspaceStore.js";

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const store = new FileWorkspaceStore(
    resolve(workspaceRoot, ".workbench", "workspaces.json"),
    workspaceRoot,
  );
  const args = parseWorkspaceArgs(process.argv.slice(2));
  if (args.command === "list") {
    for (const workspace of await store.list()) {
      console.log(`${workspace.id}\t${workspace.name}\t${workspace.rootPath}${workspace.builtIn ? "\tbuilt-in" : ""}`);
    }
    return;
  }
  if (args.command === "add") {
    const workspace = await store.add({
      id: args.id,
      rootPath: args.rootPath,
      ...(args.name ? { name: args.name } : {}),
    });
    console.log(`Workspace registered: ${workspace.id} (${workspace.rootPath})`);
    return;
  }
  await store.remove(args.id);
  console.log(`Workspace removed: ${args.id}`);
}

main().catch((error: unknown) => {
  console.error("Workspace command failed:", error);
  process.exit(1);
});
