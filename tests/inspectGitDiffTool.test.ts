import { describe, expect, it, vi } from "vitest";
import {
  createInspectGitDiffTool,
  type GitDiffRunner,
} from "../src/tools/inspectGitDiffTool.js";
import { executeTool } from "../src/tools/toolExecutor.js";
import { ToolTimeoutError } from "../src/tools/toolTimeoutError.js";

describe("inspect-git-diff tool", () => {
  it("returns bounded working-tree diff evidence with fixed Git arguments", async () => {
    const diff = "diff --git a/src/a.ts b/src/a.ts\n+new line\n";
    const runGit = vi
      .fn<GitDiffRunner>()
      .mockResolvedValueOnce(Buffer.from(diff))
      .mockResolvedValueOnce(Buffer.from("src/a.ts\0"))
      .mockResolvedValueOnce(
        Buffer.from("src/new.ts\0.env\0runs/output.json\0"),
      );
    const evidence = await executeTool(
      createInspectGitDiffTool({
        allowedRoot: process.cwd(),
        runGit,
      }),
      { mode: "working-tree", contextLines: 5, maxBytes: 1000 },
    );

    expect(runGit).toHaveBeenCalledTimes(3);
    expect(runGit.mock.calls[0]?.[0]).toMatchObject({
      cwd: process.cwd(),
      timeoutMs: 5_000,
      maximumBytes: 1_000,
    });
    expect(runGit.mock.calls[0]?.[0].args).toEqual(
      expect.arrayContaining([
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--unified=5",
        ".",
        ":(exclude,glob).env",
        ":(exclude,glob)**/.env",
        ":(exclude,glob)runs/**",
      ]),
    );
    expect(runGit.mock.calls[1]?.[0].args).toEqual(
      expect.arrayContaining([
        "--name-only",
        "--diff-filter=ACMRTUXB",
        ":(exclude,glob)node_modules/**",
      ]),
    );
    expect(runGit.mock.calls[2]?.[0].args).toEqual(
      expect.arrayContaining([
        "ls-files",
        "--others",
        "--exclude-standard",
        ":(exclude,glob)**/runs/**",
      ]),
    );
    expect(evidence).toMatchObject({
      toolId: "inspect-git-diff",
      output: {
        mode: "working-tree",
        diff,
        sizeBytes: Buffer.byteLength(diff),
        empty: false,
        trackedPaths: ["src/a.ts"],
        untrackedPaths: ["src/new.ts"],
      },
      failure: null,
      succeeded: true,
    });
  });

  it("uses the staged diff mode without accepting arbitrary flags", async () => {
    const runGit = vi.fn<GitDiffRunner>().mockResolvedValue(Buffer.alloc(0));
    const evidence = await executeTool(
      createInspectGitDiffTool({
        allowedRoot: process.cwd(),
        runGit,
      }),
      { mode: "staged", contextLines: 3, maxBytes: 65_536 },
    );

    expect(runGit.mock.calls[0]?.[0].args).toContain("--cached");
    expect(evidence.output).toMatchObject({
      mode: "staged",
      diff: "",
      sizeBytes: 0,
      empty: true,
      trackedPaths: [],
      untrackedPaths: [],
    });
  });

  it("combines staged, unstaged, and untracked workspace evidence", async () => {
    const runGit = vi
      .fn<GitDiffRunner>()
      .mockResolvedValueOnce(Buffer.from("diff --git a/src/a.ts b/src/a.ts\n+unstaged\n"))
      .mockResolvedValueOnce(Buffer.from("src/a.ts\0"))
      .mockResolvedValueOnce(Buffer.from("diff --git a/src/b.ts b/src/b.ts\n+staged\n"))
      .mockResolvedValueOnce(Buffer.from("src/b.ts\0"))
      .mockResolvedValueOnce(Buffer.from("src/new.ts\0"));
    const evidence = await executeTool(
      createInspectGitDiffTool({
        allowedRoot: process.cwd(),
        runGit,
      }),
      { mode: "workspace", contextLines: 3, maxBytes: 65_536 },
    );

    expect(runGit).toHaveBeenCalledTimes(5);
    expect(runGit.mock.calls[0]?.[0].args).not.toContain("--cached");
    expect(runGit.mock.calls[2]?.[0].args).toContain("--cached");
    expect(runGit.mock.calls.slice(0, 4).every(([invocation]) =>
      invocation.args.includes(":(exclude,glob)**/.env")
    )).toBe(true);
    expect(evidence.output).toMatchObject({
      mode: "workspace",
      empty: false,
      trackedPaths: ["src/a.ts", "src/b.ts"],
      untrackedPaths: ["src/new.ts"],
    });
    expect(evidence.output?.diff).toContain("UNSTAGED PATCH:");
    expect(evidence.output?.diff).toContain("STAGED PATCH:");
  });

  it("rejects unsupported input fields", async () => {
    const runGit = vi.fn<GitDiffRunner>();
    const evidence = await executeTool(
      createInspectGitDiffTool({
        allowedRoot: process.cwd(),
        runGit,
      }),
      {
        mode: "working-tree",
        contextLines: 3,
        maxBytes: 65_536,
        command: "status",
      },
    );

    expect(evidence.failure?.category).toBe("validation");
    expect(runGit).not.toHaveBeenCalled();
  });

  it("classifies oversized diff output as a permission failure", async () => {
    const runGit = vi
      .fn<GitDiffRunner>()
      .mockResolvedValueOnce(Buffer.from("large"))
      .mockResolvedValueOnce(Buffer.from("changed.ts\0"))
      .mockResolvedValueOnce(Buffer.from("new.ts\0"));
    const evidence = await executeTool(
      createInspectGitDiffTool({
        allowedRoot: process.cwd(),
        maximumBytes: 4,
        runGit,
      }),
      { mode: "working-tree", contextLines: 3, maxBytes: 100 },
    );

    expect(evidence.failure?.category).toBe("permission");
    expect(evidence.output).toBeNull();
  });

  it("preserves timeout classification", async () => {
    const runGit = vi.fn<GitDiffRunner>().mockRejectedValue(
      new ToolTimeoutError("Git diff timed out."),
    );
    const evidence = await executeTool(
      createInspectGitDiffTool({
        allowedRoot: process.cwd(),
        runGit,
      }),
      { mode: "working-tree", contextLines: 3, maxBytes: 65_536 },
    );

    expect(evidence.failure).toEqual({
      category: "timeout",
      message: "Git diff timed out.",
    });
  });
});
