// Incident 2026-08-08: the external builder session forged an operator
// decision by invoking the workbench CLI from its shell. Decision writes
// are operator acts (Decision 084/089) and now require an interactive
// terminal — a scripted or agent-driven process has no TTY and is
// refused. This does not authenticate WHO is at the terminal (single
// operator machine); it removes the non-interactive forgery path.

export interface TerminalLike {
  isTTY?: boolean | undefined;
}

export function requireInteractiveTerminal(
  commandLabel: string,
  stdin: TerminalLike = process.stdin,
  stdout: TerminalLike = process.stdout,
): void {
  if (stdin.isTTY === true && stdout.isTTY === true) return;
  throw new Error(
    `${commandLabel} records an operator decision and requires an interactive terminal. ` +
      "Non-interactive invocation is refused (incident 2026-08-08: forged " +
      "builder decision). Use the console, or run this command directly in " +
      "your own terminal.",
  );
}
