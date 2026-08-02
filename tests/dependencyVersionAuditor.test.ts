import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDependencyVersionAuditorTool } from "../src/tools/dependencyVersionAuditor.js";
import { executeTool } from "../src/tools/toolExecutor.js";

async function writeManifest(
  root: string,
  path: string,
  manifest: unknown,
): Promise<void> {
  const directory = join(root, path);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify(manifest),
  );
}

describe("dependency-version-auditor", () => {
  it("reports deterministic inconsistencies and malformed manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "dependency-auditor-"));
    await writeManifest(root, "packages/alpha", {
      dependencies: { react: "^18.0.0", zod: "^4.0.0" },
    });
    await writeManifest(root, "packages/beta", {
      devDependencies: { react: "^19.0.0", zod: "^4.0.0" },
    });
    await mkdir(join(root, "packages/broken"), { recursive: true });
    await writeFile(join(root, "packages/broken/package.json"), "{broken");

    const evidence = await executeTool(
      createDependencyVersionAuditorTool({ allowedRoot: root }),
      {
        path: ".",
        maxFiles: 20,
        maxTotalBytes: 50_000,
        maxDepth: 5,
      },
    );

    expect(evidence.succeeded).toBe(true);
    expect(evidence.output).toMatchObject({
      scannedFiles: [
        "packages/alpha/package.json",
        "packages/beta/package.json",
        "packages/broken/package.json",
      ],
      malformedFiles: [{
        path: "packages/broken/package.json",
        reason: "invalid-json",
      }],
      inconsistentDependencies: [{
        name: "react",
        versions: [
          {
            version: "^18.0.0",
            declarations: [{
              path: "packages/alpha/package.json",
              sections: ["dependencies"],
            }],
          },
          {
            version: "^19.0.0",
            declarations: [{
              path: "packages/beta/package.json",
              sections: ["devDependencies"],
            }],
          },
        ],
      }],
      truncated: false,
    });
  });

  it("rejects traversal outside the injected workspace root", async () => {
    const root = await mkdtemp(join(tmpdir(), "dependency-auditor-root-"));
    const evidence = await executeTool(
      createDependencyVersionAuditorTool({ allowedRoot: root }),
      {
        path: "..",
        maxFiles: 20,
        maxTotalBytes: 50_000,
        maxDepth: 5,
      },
    );

    expect(evidence.succeeded).toBe(false);
    expect(evidence.failure).toMatchObject({ category: "permission" });
  });

  it("skips symlinks and records bounded truncation", async () => {
    const root = await mkdtemp(join(tmpdir(), "dependency-auditor-limits-"));
    const outside = await mkdtemp(join(tmpdir(), "dependency-auditor-outside-"));
    await writeManifest(root, "packages/alpha", {
      dependencies: { react: "^18.0.0" },
    });
    await writeManifest(root, "packages/beta", {
      dependencies: { react: "^19.0.0" },
    });
    await writeManifest(outside, "secret", {
      dependencies: { secret: "1.0.0" },
    });
    await symlink(outside, join(root, "linked-outside"));

    const evidence = await executeTool(
      createDependencyVersionAuditorTool({ allowedRoot: root }),
      {
        path: ".",
        maxFiles: 1,
        maxTotalBytes: 50_000,
        maxDepth: 5,
      },
    );

    expect(evidence.succeeded).toBe(true);
    expect(evidence.output).toMatchObject({
      scannedFiles: ["packages/alpha/package.json"],
      inconsistentDependencies: [],
      truncated: true,
    });
    expect(evidence.output?.scannedFiles).not.toContain(
      "linked-outside/secret/package.json",
    );
  });

  it("does not read a manifest that exceeds the remaining byte budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "dependency-auditor-bytes-"));
    await writeManifest(root, "large", {
      dependencies: { example: "a-very-long-version-value" },
    });

    const evidence = await executeTool(
      createDependencyVersionAuditorTool({ allowedRoot: root }),
      {
        path: ".",
        maxFiles: 10,
        maxTotalBytes: 10,
        maxDepth: 5,
      },
    );

    expect(evidence.output).toMatchObject({
      scannedFiles: [],
      totalBytesRead: 0,
      truncated: true,
    });
  });
});
