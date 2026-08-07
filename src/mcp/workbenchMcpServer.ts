import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createWorkbenchMcpTools,
  type WorkbenchMcpDependencies,
} from "./workbenchMcpTools.js";

const SERVER_INSTRUCTIONS =
  "Agentic Engineering Workbench evidence connection (Decision 084): read " +
  "everything, write evidence freely, never write agent policy or source. " +
  "Agent behavior changes only through the Workbench improvement loop and " +
  "source-controlled releases.";

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function buildWorkbenchMcpServer(
  deps: WorkbenchMcpDependencies,
  version: string,
): McpServer {
  const tools = createWorkbenchMcpTools(deps);
  const server = new McpServer(
    { name: "agentic-workbench", version },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "list_agents",
    {
      description:
        "Read-only. List every registered Workbench agent with id, version, " +
        "lifecycle status, and description.",
    },
    async () => asText(await tools.listAgents()),
  );

  server.registerTool(
    "describe_agent",
    {
      description:
        "Read-only. Return the full immutable manifest of a registered agent.",
      inputSchema: { agentId: z.string().min(1) },
    },
    async (input) => asText(await tools.describeAgent(input)),
  );

  server.registerTool(
    "list_artifacts",
    {
      description:
        "Read-only. List evidence artifact summaries from the shared runs " +
        "store (agent runs, evaluations, proposals, decisions) or the foundry " +
        "store (project briefs, brief decisions, intake turns, export feedback).",
      inputSchema: {
        source: z.enum(["runs", "foundry"]),
        kind: z.string().min(1).optional(),
        agentId: z.string().min(1).optional(),
        briefId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async (input) => asText(await tools.listArtifacts(input)),
  );

  server.registerTool(
    "get_artifact",
    {
      description:
        "Read-only. Load one complete evidence artifact by id from the runs " +
        "or foundry store.",
      inputSchema: {
        source: z.enum(["runs", "foundry"]),
        artifactId: z.string().min(1),
      },
    },
    async (input) => asText(await tools.getArtifact(input)),
  );

  server.registerTool(
    "submit_feedback",
    {
      description:
        "Writes evidence. Import an exported agent's feedback bundle: the " +
        "bundle's export identity and policy digest are verified against the " +
        "export package's provenance before an immutable export-feedback " +
        "evidence record is persisted. Never modifies agent policy.",
      inputSchema: {
        bundleJson: z.string().min(2),
        exportDirectory: z.string().min(1).optional(),
      },
    },
    async (input) => asText(await tools.submitFeedback(input)),
  );

  server.registerTool(
    "run_agent",
    {
      description:
        "Writes evidence. Run a registered Workbench agent once against a " +
        "JSON input, on the Workbench's own provider and measured model, " +
        "persisting a complete agent-run evidence artifact. Requires the " +
        "Workbench machine's provider key. Never modifies agent policy.",
      inputSchema: {
        agentId: z.string().min(1),
        inputJson: z.string().min(2),
        model: z.string().min(1).optional(),
      },
    },
    async (input) => asText(await tools.runAgent(input)),
  );

  server.registerTool(
    "intake_start",
    {
      description:
        "Writes evidence. Start an evidence-grade project-intake interview " +
        "through the Workbench controller: creates a versioned brief, runs " +
        "turn 1 on the measured model, persists brief and turn evidence, and " +
        "returns the questions to relay to the user.",
      inputSchema: {
        title: z.string().min(1).max(200),
        idea: z.string().min(1).max(4_000),
        maxTurns: z.number().int().min(1).max(20).optional(),
      },
    },
    async (input) => asText(await tools.intakeStart(input)),
  );

  server.registerTool(
    "intake_turn",
    {
      description:
        "Writes evidence. Submit the user's answers for the next intake " +
        "turn. Answers may reference question ids from the previous turn " +
        "(questionId) or volunteer new information (questionId null). " +
        "Produces the next brief version and turn evidence.",
      inputSchema: {
        briefId: z.uuid(),
        answers: z
          .array(
            z.object({
              questionId: z.uuid().nullable(),
              answer: z.string().min(1).max(8_000),
            }),
          )
          .min(1)
          .max(50),
      },
    },
    async (input) => asText(await tools.intakeTurn(input)),
  );

  server.registerTool(
    "intake_status",
    {
      description:
        "Read-only. Report an intake interview's progress: brief version, " +
        "turn status, pending questions, open issues, and provenance " +
        "conversion metrics.",
      inputSchema: { briefId: z.uuid() },
    },
    async (input) => asText(await tools.intakeStatus(input)),
  );

  server.registerTool(
    "architect_plan",
    {
      description:
        "Writes evidence. Run the Project Architect on an APPROVED project " +
        "brief, producing an architecture and acceptance plan with " +
        "deterministic coverage validation against the brief. Refuses briefs " +
        "whose latest decision is not approve. Requires the Workbench " +
        "machine's provider key. Never modifies agent policy.",
      inputSchema: {
        briefId: z.uuid(),
        model: z.string().min(1).optional(),
        reviseFromId: z.string().min(1).optional(),
      },
    },
    async (input) => asText(await tools.architectPlan(input)),
  );

  server.registerTool(
    "record_plan_decision",
    {
      description:
        "Writes an operator decision. Record approve, reject, or revise on an " +
        "architecture plan, pinned to its exact digest. Recorded with the " +
        "named operator's identity; approval is blocked while blocking " +
        "concerns remain.",
      inputSchema: {
        planId: z.uuid(),
        decision: z.enum(["approve", "reject", "revise"]),
        operatorId: z.string().min(1).max(200),
        rationale: z.string().min(1).max(8_000),
        requestedRevisions: z.array(z.string().min(1).max(2_000)).max(20).optional(),
      },
    },
    async (input) => asText(await tools.recordPlanDecision(input)),
  );

  server.registerTool(
    "capability_plan",
    {
      description:
        "Writes evidence. Run the Capability Planner on an APPROVED " +
        "architecture plan, mapping every implementation slice to existing " +
        "agents, tools, project code, or proposed missing capabilities, with " +
        "deterministic catalog and coverage validation. Refuses plans whose " +
        "latest decision is not approve. Requires the Workbench machine's " +
        "provider key. Never modifies agent policy.",
      inputSchema: {
        planId: z.uuid(),
        model: z.string().min(1).optional(),
        reviseFromId: z.string().min(1).optional(),
      },
    },
    async (input) => asText(await tools.capabilityPlan(input)),
  );

  server.registerTool(
    "record_capability_decision",
    {
      description:
        "Writes an operator decision. Record approve, reject, or revise on a " +
        "capability plan, pinned to its exact digest. Recorded with the named " +
        "operator's identity; approval is blocked while blocking concerns " +
        "remain.",
      inputSchema: {
        capabilityPlanId: z.uuid(),
        decision: z.enum(["approve", "reject", "revise"]),
        operatorId: z.string().min(1).max(200),
        rationale: z.string().min(1).max(8_000),
        requestedRevisions: z.array(z.string().min(1).max(2_000)).max(20).optional(),
      },
    },
    async (input) => asText(await tools.recordCapabilityDecision(input)),
  );

  server.registerTool(
    "design_tests",
    {
      description:
        "Writes evidence. Run the Test Designer on an APPROVED capability " +
        "plan, producing executable acceptance tests (visible plus protected " +
        "holdout files) authored from the planning chain only, with " +
        "deterministic coverage, path, and syntax validation. Refuses " +
        "capability plans whose latest decision is not approve. Requires the " +
        "Workbench machine's provider key. Never modifies agent policy.",
      inputSchema: {
        capabilityPlanId: z.uuid(),
        model: z.string().min(1).optional(),
        reviseFromId: z.string().min(1).optional(),
      },
    },
    async (input) => asText(await tools.designTests(input)),
  );

  server.registerTool(
    "record_test_decision",
    {
      description:
        "Writes an operator decision. Record approve, reject, or revise on a " +
        "test suite, pinned to its exact digest. Recorded with the named " +
        "operator's identity; approval is blocked while blocking concerns " +
        "remain.",
      inputSchema: {
        testSuiteId: z.uuid(),
        decision: z.enum(["approve", "reject", "revise"]),
        operatorId: z.string().min(1).max(200),
        rationale: z.string().min(1).max(8_000),
        requestedRevisions: z.array(z.string().min(1).max(2_000)).max(20).optional(),
      },
    },
    async (input) => asText(await tools.recordTestDecision(input)),
  );

  server.registerTool(
    "create_work_order",
    {
      description:
        "Writes evidence. Deterministically assemble a builder work order for " +
        "one implementation slice from the approved chain (no model call). " +
        "Requires an approved test suite and approved submissions for every " +
        "dependency slice. Omit sliceId to select the next buildable slice.",
      inputSchema: {
        testSuiteId: z.uuid(),
        sliceId: z.uuid().optional(),
      },
    },
    async (input) => asText(await tools.createWorkOrder(input)),
  );

  server.registerTool(
    "materialize_tests",
    {
      description:
        "Writes files into a project workspace. Copy the approved suite's " +
        "VISIBLE acceptance test files into the given project root exactly " +
        "canonically. Holdout files are never materialized by this tool.",
      inputSchema: {
        workOrderId: z.uuid(),
        projectRoot: z.string().min(1),
      },
    },
    async (input) => asText(await tools.materializeTests(input)),
  );

  server.registerTool(
    "prepare_builder_workspace",
    {
      description:
        "Writes files into a project workspace. Prepare an ISOLATED builder " +
        "workspace for a work order: visible acceptance tests, a .mcp.json " +
        "wiring the workbench-builder server with a pinned project root, " +
        "Claude Code deny/sandbox settings blocking Workbench reads, and a " +
        "BUILDER.md rendered without holdout paths (Decision 087).",
      inputSchema: {
        workOrderId: z.uuid(),
        projectRoot: z.string().min(1),
      },
    },
    async (input) => asText(await tools.prepareBuilderWorkspace(input)),
  );

  server.registerTool(
    "submit_slice",
    {
      description:
        "Writes evidence. Verify a builder's slice submission: byte-exact " +
        "scope check of acceptance-tests/, then Workbench-run applicable " +
        "visible and holdout tests through the controlled npm runner. " +
        "Persists the submission evidence regardless of outcome. Never " +
        "modifies agent policy.",
      inputSchema: {
        workOrderId: z.uuid(),
        projectRoot: z.string().min(1),
      },
    },
    async (input) => asText(await tools.submitSlice(input)),
  );

  server.registerTool(
    "record_build_completion",
    {
      description:
        "Writes an operator-attributed evidence record. Close a build " +
        "generation (Decision 088): requires an approved suite, approving " +
        "submission decisions on every slice, a clean working tree, and " +
        "the FULL suite (holdouts included) green out-of-tree; pins the " +
        "main commit SHA and a Workbench-computed tree digest. Holdout " +
        "paths are redacted in the result. Evolution rounds descend from " +
        "this record.",
      inputSchema: {
        testSuiteId: z.uuid(),
        projectRoot: z.string().min(1),
        operatorId: z.string().min(1).max(200),
        retroactive: z.boolean().optional(),
      },
    },
    async (input) => asText(await tools.recordBuildCompletion(input)),
  );

  server.registerTool(
    "record_submission_decision",
    {
      description:
        "Writes an operator decision. Record approve, reject, or revise on a " +
        "slice submission, pinned to its digest. Approval requires the " +
        "Workbench verification to have passed and authorizes the merge; the " +
        "merge itself remains a human git action.",
      inputSchema: {
        submissionId: z.uuid(),
        decision: z.enum(["approve", "reject", "revise"]),
        operatorId: z.string().min(1).max(200),
        rationale: z.string().min(1).max(8_000),
        requestedRevisions: z.array(z.string().min(1).max(2_000)).max(20).optional(),
      },
    },
    async (input) => asText(await tools.recordSubmissionDecision(input)),
  );

  server.registerTool(
    "record_brief_decision",
    {
      description:
        "Writes an operator decision. Record approve, reject, or revise on a " +
        "specific project-brief version, pinned to its exact content digest. " +
        "Recorded with the named operator's identity; approval is blocked " +
        "while unresolved entries or open questions remain, identical to the " +
        "CLI boundary.",
      inputSchema: {
        briefId: z.uuid(),
        version: z.number().int().min(1),
        decision: z.enum(["approve", "reject", "revise"]),
        operatorId: z.string().min(1).max(200),
        rationale: z.string().min(1).max(8_000),
        requestedRevisions: z.array(z.string().min(1).max(2_000)).max(20).optional(),
      },
    },
    async (input) => asText(await tools.recordBriefDecision(input)),
  );

  server.registerTool(
    "record_promotion_decision",
    {
      description:
        "Writes an operator decision. Record approve, reject, or revise " +
        "against a saved candidate comparison. Recorded with the named " +
        "operator's identity; approval requires passed promotion gates, " +
        "identical to the web boundary. Never mutates the agent registry.",
      inputSchema: {
        candidateEvaluationId: z.string().min(1),
        decision: z.enum(["approve", "reject", "revise"]),
        operatorId: z.string().min(1).max(200),
        rationale: z.string().min(1).max(8_000),
        proposalArtifactId: z.string().min(1).optional(),
      },
    },
    async (input) => asText(await tools.recordPromotionDecision(input)),
  );

  server.registerTool(
    "get_approved_export",
    {
      description:
        "Read-only delivery. Return the complete approved export package for " +
        "an agent (all files with contents) so the session can install it " +
        "locally. Only evidence-approved, digest-verified packages are served.",
      inputSchema: {
        agentId: z.string().min(1),
        target: z.enum(["claude-code"]),
      },
    },
    async (input) => asText(await tools.getApprovedExport(input)),
  );

  return server;
}
