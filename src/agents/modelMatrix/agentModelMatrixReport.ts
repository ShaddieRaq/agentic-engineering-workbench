import type { AgentModelMatrix, AgentModelMatrixCell } from "./agentModelMatrix.js";

function pct(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function int(value: number | null): string {
  return value === null ? "n/a" : String(Math.round(value));
}

function usd(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(4)}`;
}

function ms(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value)} ms`;
}

function gate(cell: AgentModelMatrixCell): string {
  if (cell.status === "error") return "error";
  return cell.passed ? "✓ pass" : "✗ FAIL";
}

function row(cell: AgentModelMatrixCell): string {
  return `| ${cell.model} | ${gate(cell)} | ${pct(cell.passRate)} | ${cell.totalRuns} | ${int(cell.totalTokens)} | ${int(cell.avgTokensPerRun)} | ${usd(cell.estimatedCostUsd)} | ${ms(cell.avgLatencyMs)} |`;
}

/**
 * Renders a model matrix as a self-contained markdown report — the shareable
 * form of the "tested on X" badge. Faithful to the artifact: every number
 * comes straight from a cell; nothing is inferred or embellished.
 */
export function renderModelMatrixMarkdown(matrix: AgentModelMatrix): string {
  const version = matrix.agentVersion ? `@${matrix.agentVersion}` : "";
  const lines: string[] = [];

  lines.push(`# Model Matrix — ${matrix.agentId}${version}`);
  lines.push("");
  lines.push(
    `Cross-model evaluation over the agent's verification datasets · repetitions ${matrix.execution.repetitions} · concurrency ${matrix.execution.concurrency}.`,
  );
  lines.push("");
  lines.push(
    "| Model | Gate | Pass rate | Runs | Tokens | Avg/run | Est. cost | Avg latency |",
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const cell of matrix.cells) {
    lines.push(row(cell));
  }
  lines.push("");

  // Honest takeaways derived only from the cells.
  const ok = matrix.cells.filter((cell) => cell.status === "ok");
  const passing = ok.filter((cell) => cell.passed);
  const errored = matrix.cells.filter((cell) => cell.status === "error");

  lines.push("## Notes");
  lines.push("");
  lines.push(`- ${matrix.cells.length} model(s) compared.`);

  if (passing.length > 0) {
    const priced = passing.filter((cell) => cell.estimatedCostUsd !== null);
    if (priced.length > 0) {
      const cheapest = priced.reduce((best, cell) =>
        cell.estimatedCostUsd! < best.estimatedCostUsd! ? cell : best,
      );
      lines.push(
        `- Cheapest passing model: **${cheapest.model}** at ${usd(cheapest.estimatedCostUsd)}.`,
      );
    } else {
      lines.push(
        `- Passing models: ${passing.map((cell) => cell.model).join(", ")} (cost not priced for these).`,
      );
    }
  } else {
    lines.push("- No model passed the verification gate on this run.");
  }

  if (errored.length > 0) {
    for (const cell of errored) {
      lines.push(`- \`${cell.model}\` did not run: ${cell.error ?? "unknown error"}.`);
    }
  }

  lines.push("");
  lines.push(`_Matrix ${matrix.matrixId} · generated ${matrix.completedAt}._`);
  lines.push("");

  return lines.join("\n");
}
