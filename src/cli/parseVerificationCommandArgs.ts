import type { VerificationCommandInput } from "../tools/verificationCommandTool.js";

function optionalValue(
  args: string[],
  option: string,
): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

export function parseVerificationCommandArgs(
  args: string[],
): VerificationCommandInput {
  const command = optionalValue(args, "--command");
  const testFile = optionalValue(args, "--test-file");
  const maxOutputBytes = optionalValue(args, "--max-output-bytes");

  if (
    command !== "typecheck" &&
    command !== "test" &&
    command !== "test-file"
  ) {
    throw new Error(
      "--command must be typecheck, test, or test-file",
    );
  }

  return {
    command,
    ...(testFile === undefined ? {} : { testFile }),
    maxOutputBytes:
      maxOutputBytes === undefined ? 65_536 : Number(maxOutputBytes),
  };
}
