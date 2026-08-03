import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { executeTool } from "../src/tools/toolExecutor.js";
import { ToolTimeoutError } from "../src/tools/toolTimeoutError.js";
import {
  createVerificationCommandTool,
  type VerificationCommandRunner,
} from "../src/tools/verificationCommandTool.js";

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "verification-command-"));
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "tests", "sample.test.ts"), "export {};\n");
  return root;
}

describe("run-verification-command tool", () => {
  it("runs the fixed typecheck command with bounded execution evidence", async () => {
    const root = await createWorkspace();
    const runCommand = vi.fn<VerificationCommandRunner>().mockResolvedValue({
      exitCode: 0,
      signal: null,
      stdout: "typecheck passed\n",
      stderr: "",
      outputBytes: 17,
      truncated: false,
    });
    const evidence = await executeTool(
      createVerificationCommandTool({
        allowedRoot: root,
        timeoutMs: 10_000,
        maximumOutputBytes: 50_000,
        runCommand,
      }),
      { command: "typecheck", maxOutputBytes: 4_096 },
    );

    expect(runCommand).toHaveBeenCalledWith({
      cwd: await realpath(root),
      args: ["run", "typecheck"],
      timeoutMs: 10_000,
      maximumOutputBytes: 4_096,
    });
    expect(evidence).toMatchObject({
      toolId: "run-verification-command",
      succeeded: true,
      failure: null,
      output: {
        command: "typecheck",
        testFile: null,
        executable: "npm",
        arguments: ["run", "typecheck"],
        exitCode: 0,
        passed: true,
        environmentPolicy: "restricted",
        securityBoundary: "controlled-process-not-os-sandboxed",
      },
    });
  });

  it("passes one canonical existing test path as data rather than shell text", async () => {
    const root = await createWorkspace();
    const runCommand = vi.fn<VerificationCommandRunner>().mockResolvedValue({
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      outputBytes: 0,
      truncated: false,
    });
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root, runCommand }),
      {
        command: "test-file",
        testFile: "tests/sample.test.ts",
        maxOutputBytes: 65_536,
      },
    );

    expect(runCommand.mock.calls[0]?.[0].args).toEqual([
      "test",
      "--",
      "./tests/sample.test.ts",
    ]);
    expect(evidence.output).toMatchObject({
      testFile: "tests/sample.test.ts",
      passed: true,
    });
  });

  it("preserves a failing verification as a completed command outcome", async () => {
    const root = await createWorkspace();
    const runCommand = vi.fn<VerificationCommandRunner>().mockResolvedValue({
      exitCode: 1,
      signal: null,
      stdout: "1 test failed\n",
      stderr: "AssertionError\n",
      outputBytes: 29,
      truncated: false,
    });
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root, runCommand }),
      { command: "test", maxOutputBytes: 65_536 },
    );

    expect(evidence.succeeded).toBe(true);
    expect(evidence.output).toMatchObject({
      exitCode: 1,
      stdout: "1 test failed\n",
      stderr: "AssertionError\n",
      passed: false,
    });
  });

  it("rejects arbitrary command text before process execution", async () => {
    const root = await createWorkspace();
    const runCommand = vi.fn<VerificationCommandRunner>();
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root, runCommand }),
      { command: "rm -rf .", maxOutputBytes: 65_536 },
    );

    expect(evidence.failure?.category).toBe("validation");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("rejects a test path outside the workspace", async () => {
    const root = await createWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "outside-test-"));
    const outsideTest = join(outside, "outside.test.ts");
    await writeFile(outsideTest, "export {};\n");
    const runCommand = vi.fn<VerificationCommandRunner>();
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root, runCommand }),
      {
        command: "test-file",
        testFile: outsideTest,
        maxOutputBytes: 65_536,
      },
    );

    expect(evidence.failure?.category).toBe("permission");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("rejects non-test files", async () => {
    const root = await createWorkspace();
    await writeFile(join(root, "tests", "notes.txt"), "not a test\n");
    const runCommand = vi.fn<VerificationCommandRunner>();
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root, runCommand }),
      {
        command: "test-file",
        testFile: "tests/notes.txt",
        maxOutputBytes: 65_536,
      },
    );

    expect(evidence.failure?.category).toBe("execution");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("preserves timeout classification", async () => {
    const root = await createWorkspace();
    const runCommand = vi.fn<VerificationCommandRunner>().mockRejectedValue(
      new ToolTimeoutError("Verification timed out."),
    );
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root, runCommand }),
      { command: "test", maxOutputBytes: 65_536 },
    );

    expect(evidence.failure).toEqual({
      category: "timeout",
      message: "Verification timed out.",
    });
  });

  it("does not inherit the workbench API key", async () => {
    const root = await createWorkspace();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"process.stdout.write(process.env.OPENAI_API_KEY ?? 'missing')\"",
        },
      }),
    );
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "must-not-reach-child";

    try {
      const evidence = await executeTool(
        createVerificationCommandTool({ allowedRoot: root }),
        { command: "test", maxOutputBytes: 65_536 },
      );

      expect(evidence.output?.passed).toBe(true);
      expect(evidence.output?.stdout).toContain("missing");
      expect(evidence.output?.stdout).not.toContain("must-not-reach-child");
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("bounds combined process output while retaining the observed byte count", async () => {
    const root = await createWorkspace();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"process.stdout.write('x'.repeat(500))\"",
        },
      }),
    );
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root }),
      { command: "test", maxOutputBytes: 64 },
    );

    expect(evidence.output?.passed).toBe(true);
    expect(evidence.output?.truncated).toBe(true);
    expect(evidence.output?.outputBytes).toBeGreaterThan(64);
    expect(
      Buffer.byteLength(evidence.output?.stdout ?? "") +
        Buffer.byteLength(evidence.output?.stderr ?? ""),
    ).toBeLessThanOrEqual(64);
  });

  it("terminates an over-deadline verification process", async () => {
    const root = await createWorkspace();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node -e \"setTimeout(() => {}, 5000)\"",
        },
      }),
    );
    const evidence = await executeTool(
      createVerificationCommandTool({ allowedRoot: root, timeoutMs: 100 }),
      { command: "test", maxOutputBytes: 65_536 },
    );

    expect(evidence.failure?.category).toBe("timeout");
    expect(evidence.durationMs).toBeLessThan(2_000);
  });
});
