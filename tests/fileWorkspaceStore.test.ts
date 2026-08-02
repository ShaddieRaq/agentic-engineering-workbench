import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileWorkspaceStore } from "../src/workspaces/fileWorkspaceStore.js";

describe("FileWorkspaceStore", () => {
  it("registers, resolves, persists, and removes local workspaces", async () => {
    const platformRoot = await mkdtemp(join(tmpdir(), "workspace-platform-"));
    const projectRoot = await mkdtemp(join(tmpdir(), "workspace-project-"));
    const filePath = join(platformRoot, ".workbench", "workspaces.json");
    const store = new FileWorkspaceStore(filePath, platformRoot);

    const added = await store.add({ id: "sample-project", name: "Sample", rootPath: projectRoot });
    expect(added).toMatchObject({ id: "sample-project", name: "Sample", builtIn: false });
    expect((await new FileWorkspaceStore(filePath, platformRoot).get("sample-project")).rootPath).toBe(added.rootPath);
    await store.remove("sample-project");
    await expect(store.get("sample-project")).rejects.toThrow("Unknown workspace");
    await expect(store.remove("workbench")).rejects.toThrow("built-in");
  });

  it("rejects duplicate roots and non-directory paths", async () => {
    const platformRoot = await mkdtemp(join(tmpdir(), "workspace-platform-"));
    const projectRoot = await mkdtemp(join(tmpdir(), "workspace-project-"));
    const file = join(platformRoot, "file.txt");
    await writeFile(file, "not a directory");
    const store = new FileWorkspaceStore(join(platformRoot, "workspaces.json"), platformRoot);
    await store.add({ id: "project-one", rootPath: projectRoot });
    await expect(store.add({ id: "project-two", rootPath: projectRoot })).rejects.toThrow("path already registered");
    await expect(store.add({ id: "not-directory", rootPath: file })).rejects.toThrow("not a directory");
  });
});
