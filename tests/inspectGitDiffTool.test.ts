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

    expect(runGit).toHaveBeenNthCalledWith(1, {
      cwd: process.cwd(),
      args: [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--unified=5",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "--",
      ],
      timeoutMs: 5_000,
      maximumBytes: 1_000,
    });
    expect(runGit).toHaveBeenNthCalledWith(2, {
      cwd: process.cwd(),
      args: [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--name-only",
        "-z",
        "--diff-filter=ACMRTUXB",
        "--",
      ],
      timeoutMs: 5_000,
      maximumBytes: 1_000,
    });
    expect(runGit).toHaveBeenNthCalledWith(3, {
      cwd: process.cwd(),
      args: [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
      ],
      timeoutMs: 5_000,
      maximumBytes: 1_000,
    });
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
