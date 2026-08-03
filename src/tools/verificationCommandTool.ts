import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "./toolDefinition.js";
import { ToolTimeoutError } from "./toolTimeoutError.js";
import { resolveAllowedRepositoryPath } from "./repositoryPathPolicy.js";

export const verificationCommandIdSchema = z.enum([
  "typecheck",
  "test",
  "test-file",
]);

export const verificationCommandInputSchema = z
  .object({
    command: verificationCommandIdSchema,
    testFile: z.string().min(1).optional(),
    maxOutputBytes: z
      .number()
      .int()
      .positive()
      .max(131_072)
      .default(65_536),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.command === "test-file" && input.testFile === undefined) {
      context.addIssue({
        code: "custom",
        message: "testFile is required for the test-file command.",
        path: ["testFile"],
      });
    }

    if (input.command !== "test-file" && input.testFile !== undefined) {
      context.addIssue({
        code: "custom",
        message: "testFile is only accepted for the test-file command.",
        path: ["testFile"],
      });
    }
  });

export const verificationCommandOutputSchema = z
  .object({
    command: verificationCommandIdSchema,
    testFile: z.string().min(1).nullable(),
    executable: z.literal("npm"),
    arguments: z.array(z.string()),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    stdout: z.string(),
    stderr: z.string(),
    outputBytes: z.number().int().nonnegative(),
    truncated: z.boolean(),
    passed: z.boolean(),
    environmentPolicy: z.literal("restricted"),
    securityBoundary: z.literal("controlled-process-not-os-sandboxed"),
  })
  .strict();

export type VerificationCommandInput = z.infer<
  typeof verificationCommandInputSchema
>;
export type VerificationCommandOutput = z.infer<
  typeof verificationCommandOutputSchema
>;

export interface VerificationCommandInvocation {
  cwd: string;
  args: string[];
  timeoutMs: number;
  maximumOutputBytes: number;
}

export interface VerificationCommandProcessResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  outputBytes: number;
  truncated: boolean;
}

export type VerificationCommandRunner = (
  invocation: VerificationCommandInvocation,
) => Promise<VerificationCommandProcessResult>;

export interface VerificationCommandToolOptions {
  allowedRoot: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  runCommand?: VerificationCommandRunner;
}

const allowedTestFileSuffixes = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
] as const;

function restrictedEnvironment(): NodeJS.ProcessEnv {
  const inheritedKeys = [
    "HOME",
    "LANG",
    "LC_ALL",
    "LOGNAME",
    "PATH",
    "PATHEXT",
    "SHELL",
    "SystemRoot",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USER",
  ] as const;
  const environment: NodeJS.ProcessEnv = {
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };

  for (const key of inheritedKeys) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }

  return environment;
}

function appendBounded(
  current: Buffer,
  chunk: Buffer,
  remainingBytes: number,
): { value: Buffer; acceptedBytes: number; truncated: boolean } {
  if (remainingBytes <= 0) {
    return { value: current, acceptedBytes: 0, truncated: chunk.length > 0 };
  }

  const accepted = chunk.subarray(0, remainingBytes);
  return {
    value: Buffer.concat([current, accepted]),
    acceptedBytes: accepted.length,
    truncated: accepted.length < chunk.length,
  };
}

export function runVerificationCommandProcess({
  cwd,
  args,
  timeoutMs,
  maximumOutputBytes,
}: VerificationCommandInvocation): Promise<VerificationCommandProcessResult> {
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? "npm.cmd" : "npm";
    const useProcessGroup = process.platform !== "win32";
    const child = spawn(executable, args, {
      cwd,
      detached: useProcessGroup,
      env: restrictedEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let capturedBytes = 0;
    let totalOutputBytes = 0;
    let truncated = false;
    let timedOut = false;
    let forceKillTimeout: NodeJS.Timeout | undefined;

    const killProcessTree = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined || child.exitCode !== null) return;

      try {
        if (useProcessGroup) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // The process may have completed between the state check and signal.
      }
    };

    const capture = (destination: "stdout" | "stderr", chunk: Buffer): void => {
      totalOutputBytes += chunk.length;
      const appended = appendBounded(
        destination === "stdout" ? stdout : stderr,
        chunk,
        maximumOutputBytes - capturedBytes,
      );
      capturedBytes += appended.acceptedBytes;
      truncated ||= appended.truncated;
      if (destination === "stdout") stdout = appended.value;
      else stderr = appended.value;
    };

    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));

    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessTree("SIGTERM");
      forceKillTimeout = setTimeout(() => killProcessTree("SIGKILL"), 1_000);
      forceKillTimeout.unref();
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timeout);
      if (forceKillTimeout !== undefined) clearTimeout(forceKillTimeout);
      reject(error);
    });

    child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (forceKillTimeout !== undefined) clearTimeout(forceKillTimeout);

      if (timedOut) {
        reject(
          new ToolTimeoutError(
            `Verification command exceeded the ${timeoutMs}-millisecond deadline.`,
          ),
        );
        return;
      }

      resolve({
        exitCode,
        signal,
        stdout: new TextDecoder().decode(stdout),
        stderr: new TextDecoder().decode(stderr),
        outputBytes: totalOutputBytes,
        truncated,
      });
    });
  });
}

async function resolveTestFile(
  allowedRoot: string,
  requestedPath: string,
): Promise<{ root: string; relativePath: string }> {
  const resolved = await resolveAllowedRepositoryPath(
    { allowedRoot },
    requestedPath,
  );
  const metadata = await lstat(resolved.target);

  if (!metadata.isFile()) {
    throw new Error("Verification testFile must identify a file.");
  }

  if (
    !allowedTestFileSuffixes.some((suffix) =>
      resolved.relativePath.endsWith(suffix),
    )
  ) {
    throw new Error(
      `Verification testFile must end with ${allowedTestFileSuffixes.join(", ")}.`,
    );
  }

  return { root: resolved.allowedRoot, relativePath: resolved.relativePath };
}

export function createVerificationCommandTool(
  options: VerificationCommandToolOptions,
): ToolDefinition<VerificationCommandInput, VerificationCommandOutput> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maximumOutputBytes = options.maximumOutputBytes ?? 131_072;
  const runner = options.runCommand ?? runVerificationCommandProcess;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive integer.");
  }
  if (!Number.isInteger(maximumOutputBytes) || maximumOutputBytes < 1) {
    throw new Error("maximumOutputBytes must be a positive integer.");
  }

  return {
    id: "run-verification-command",
    description:
      "Run one fixed npm typecheck, test, or targeted test command with bounded output and no shell command input.",
    inputSchema: verificationCommandInputSchema,
    outputSchema: verificationCommandOutputSchema,
    async execute(input): Promise<VerificationCommandOutput> {
      let root = await realpath(options.allowedRoot);
      let testFile: string | null = null;
      let args: string[];

      if (input.command === "typecheck") {
        args = ["run", "typecheck"];
      } else if (input.command === "test") {
        args = ["test"];
      } else {
        const resolved = await resolveTestFile(root, input.testFile!);
        root = resolved.root;
        testFile = resolved.relativePath;
        args = ["test", "--", `./${testFile}`];
      }

      const result = await runner({
        cwd: root,
        args,
        timeoutMs,
        maximumOutputBytes: Math.min(
          input.maxOutputBytes,
          maximumOutputBytes,
        ),
      });

      return {
        command: input.command,
        testFile,
        executable: "npm",
        arguments: args,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        outputBytes: result.outputBytes,
        truncated: result.truncated,
        passed: result.exitCode === 0 && result.signal === null,
        environmentPolicy: "restricted",
        securityBoundary: "controlled-process-not-os-sandboxed",
      };
    },
  };
}
