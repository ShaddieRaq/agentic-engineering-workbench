import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createBuilderMcpTools,
  type BuilderMcpDependencies,
} from "./builderMcpTools.js";

const SERVER_INSTRUCTIONS =
  "Workbench BUILDER connection (Decision 087): you are the governed " +
  "external builder for one project workspace. You may read your own work " +
  "orders (holdout test paths and content are withheld by design), " +
  "materialize the visible acceptance tests, and submit slices for " +
  "Workbench verification. You may not read Workbench evidence, test " +
  "suites, or agent policy through any channel. Never create, modify, or " +
  "delete anything under acceptance-tests/; verification checks it " +
  "byte-for-byte. Operator decisions arrive through get_submission. " +
  "Speak through the channel (Decision 090): attach a report to " +
  "submit_slice, post progress or disclosures with post_builder_note, and " +
  "raise blockers with ask_operator — the operator answers in the console " +
  "and you poll get_operator_answer. Your words inform decisions; they " +
  "never make them, and no delegation to decide can exist.";

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function buildBuilderMcpServer(
  deps: BuilderMcpDependencies,
  version: string,
): McpServer {
  const tools = createBuilderMcpTools(deps);
  const server = new McpServer(
    { name: "workbench-builder", version },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "list_open_work_orders",
    {
      description:
        "Read-only. List work orders that still need a submission: newest " +
        "per slice, only those whose pinned test suite is still current and " +
        "whose slice has no approved submission. Carries no file paths.",
    },
    async () => asText(await tools.listOpenWorkOrders()),
  );

  server.registerTool(
    "get_work_order",
    {
      description:
        "Read-only. The builder view of one work order: slice, criteria, " +
        "interface contract, instructions, and the visible acceptance test " +
        "paths. Holdout tests appear only as a count.",
      inputSchema: { workOrderId: z.uuid() },
    },
    async (input) => asText(await tools.getWorkOrder(input)),
  );

  server.registerTool(
    "materialize_tests",
    {
      description:
        "Writes files into this builder workspace (the pinned project " +
        "root). Copies the suite's VISIBLE acceptance tests exactly " +
        "canonically. Holdout files are never materialized by this tool.",
      inputSchema: { workOrderId: z.uuid() },
    },
    async (input) => asText(await tools.materializeTests(input)),
  );

  server.registerTool(
    "submit_slice",
    {
      description:
        "Submit this workspace for Workbench verification: byte-exact scope " +
        "check of acceptance-tests/, then the applicable visible and " +
        "holdout tests run through the controlled runner. The response " +
        "withholds holdout paths and output; pass/fail per file is " +
        "included. Evidence persists on the Workbench either way. Attach " +
        "your report (disclosures, semantic changes, anything the operator " +
        "should weigh) — it is stored with the submission and shown to the " +
        "operator labeled builder-authored.",
      inputSchema: {
        workOrderId: z.uuid(),
        report: z.string().min(1).max(4_000).optional(),
      },
    },
    async (input) => asText(await tools.submitSlice(input)),
  );

  server.registerTool(
    "post_builder_note",
    {
      description:
        "Record a progress note or disclosure against your work order. The " +
        "note appears in the operator's console timeline labeled " +
        "builder-authored and unverified. Use for status, obstacles, and " +
        "honest disclosures mid-slice; use ask_operator when you need an " +
        "answer to continue.",
      inputSchema: {
        workOrderId: z.uuid(),
        note: z.string().min(1).max(4_000),
      },
    },
    async (input) => asText(await tools.postBuilderNote(input)),
  );

  server.registerTool(
    "ask_operator",
    {
      description:
        "Ask the operator a question about your work order. It renders as " +
        "an answer form in the console; poll get_operator_answer with the " +
        "returned questionId. Ask only what blocks you — decisions " +
        "(approve/reject/revise) are not questions and cannot be requested.",
      inputSchema: {
        workOrderId: z.uuid(),
        question: z.string().min(1).max(4_000),
      },
    },
    async (input) => asText(await tools.askOperator(input)),
  );

  server.registerTool(
    "get_operator_answer",
    {
      description:
        "Read-only. Poll the operator's answer to one of your questions: " +
        "status pending, or answered with the operator's text.",
      inputSchema: { questionId: z.uuid() },
    },
    async (input) => asText(await tools.getOperatorAnswer(input)),
  );

  server.registerTool(
    "get_submission",
    {
      description:
        "Read-only. One of your submissions with its verification results " +
        "(holdout output withheld) and the operator's latest decision, " +
        "including requested revisions.",
      inputSchema: { submissionId: z.uuid() },
    },
    async (input) => asText(await tools.getSubmission(input)),
  );

  return server;
}
