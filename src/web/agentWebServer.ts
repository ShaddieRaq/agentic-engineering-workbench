import { access } from "node:fs/promises";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgentApplicationService } from "../agents/agentApplicationService.js";
import type { ArtifactKind, ArtifactQuery } from "../artifacts/artifactStore.js";
import type { ArchitectService } from "../foundry/architectService.js";
import { createArchitecturePlanDecision } from "../foundry/architecturePlanDecision.js";
import type { CapabilityService } from "../foundry/capabilityService.js";
import { createCapabilityPlanDecision } from "../foundry/capabilityPlanDecision.js";
import type {
  FoundryArtifactKind,
  FoundryArtifactStore,
} from "../foundry/foundryArtifactStore.js";
import type { BuildCompletionService } from "../foundry/buildCompletionService.js";
import type { IntakeSessionController } from "../foundry/intakeSessionController.js";
import { createProjectBriefDecision } from "../foundry/projectBriefDecision.js";
import { createSubmissionDecision } from "../foundry/sliceSubmission.js";
import type { TestDesignService } from "../foundry/testDesignService.js";
import { createTestSuiteDecision } from "../foundry/testSuiteDecision.js";
import type { WorkOrderService } from "../foundry/workOrderService.js";
import {
  buildFoundryChainView,
  buildFoundryProjectIndex,
} from "./foundryChainView.js";
import { OperationStore } from "./operationStore.js";
import { operatorTokenMatches } from "./operatorToken.js";

const runRequestSchema = z
  .object({
    input: z.json().default({}),
    model: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
  })
  .strict();

const verificationRequestSchema = z
  .object({
    repetitions: z.number().int().positive().default(1),
    concurrency: z.number().int().positive().max(10).default(1),
    model: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
  })
  .strict();

const improvementRequestSchema = z
  .object({
    target: z
      .enum([
        "reliability",
        "correctness",
        "grounding",
        "cost",
        "latency",
        "safety",
        "operator-defined",
      ])
      .default("reliability"),
    description: z.string().min(1).max(2_000).optional(),
    constraints: z.array(z.string().min(1).max(500)).max(20).optional(),
    model: z.string().min(1).optional(),
  })
  .strict();

const toolBuilderHandoffRequestSchema = z
  .object({
    recommendationIndex: z.number().int().nonnegative(),
  })
  .strict();

const changeRiskHandoffRequestSchema = z
  .object({
    recommendationIndex: z.number().int().nonnegative(),
    toolBuilderRunArtifactId: z.string().min(1).optional(),
  })
  .strict();

const promotionDecisionRequestSchema = z
  .object({
    decision: z.enum(["approve", "reject", "revise"]),
    operatorId: z.string().min(1).max(200),
    rationale: z.string().min(1).max(8_000),
    proposalArtifactId: z.string().min(1).nullable().optional(),
  })
  .strict();

const addWorkspaceRequestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    rootPath: z.string().min(1),
  })
  .strict();

const foundryIntakeStartSchema = z
  .object({
    title: z.string().min(1).max(200),
    idea: z.string().min(1).max(4_000),
    maxTurns: z.number().int().min(1).max(20).optional(),
  })
  .strict();

const foundryIntakeTurnSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: z.string().min(1).nullable(),
            answer: z.string().min(1).max(4_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

const foundryArchitectRunSchema = z
  .object({
    briefId: z.uuid(),
    reviseFrom: z.string().min(1).optional(),
    // Decision 088: completion record id opening an evolution round.
    evolveFrom: z.uuid().optional(),
  })
  .strict();

const foundryCapabilityRunSchema = z
  .object({
    planId: z.uuid(),
    reviseFrom: z.string().min(1).optional(),
  })
  .strict();

const foundryTestDesignRunSchema = z
  .object({
    capabilityPlanId: z.uuid(),
    reviseFrom: z.string().min(1).optional(),
  })
  .strict();

const foundryWorkOrderRequestSchema = z
  .object({
    testSuiteId: z.uuid(),
    sliceId: z.uuid().optional(),
  })
  .strict();

// Operator-attributed generation closure (Decision 088).
const foundryCompletionRequestSchema = z
  .object({
    testSuiteId: z.uuid(),
    projectRoot: z.string().trim().min(1).max(1_000),
    operatorId: z.string().min(1).max(200),
    retroactive: z.boolean().optional(),
  })
  .strict();

// Foundry decisions are always attributed to the human operator submitting
// the form (Decision 084: decision writes carry a human identity).
// "reopen" is only meaningful on briefs (Decision 088); the stage-level
// decision constructors reject it everywhere else.
const foundryDecisionRequestSchema = z
  .object({
    decision: z.enum(["approve", "reject", "revise", "reopen"]),
    operatorId: z.string().min(1).max(200),
    rationale: z.string().min(1).max(8_000),
    requestedRevisions: z.array(z.string().min(1).max(2_000)).max(20).optional(),
  })
  .strict();

// Model-invoking Foundry stages plus the deterministic work-order issuer.
// All are optional so evidence-only deployments (and existing tests) keep
// working; runWeb wires the full set.
export interface FoundryActionServices {
  intake: Pick<IntakeSessionController, "startIntake" | "runTurn">;
  architect: Pick<ArchitectService, "createPlan">;
  capability: Pick<CapabilityService, "createCapabilityPlan">;
  testDesign: Pick<TestDesignService, "createTestSuite">;
  workOrders: Pick<WorkOrderService, "createWorkOrder" | "nextSlice">;
  // Optional so evidence-only deployments keep working; the completion
  // route answers 501 without it.
  completions?: Pick<BuildCompletionService, "recordCompletion">;
}

export interface AgentWebServerOptions {
  service: AgentApplicationService;
  apiKeyConfigured: boolean;
  operations?: OperationStore;
  foundry?: FoundryArtifactStore;
  foundryServices?: FoundryActionServices;
  clientDirectory?: string;
  logger?: boolean;
  // Decision 090: when set, decision-class routes (foundry decisions,
  // completions, promotion decisions) require the x-operator-token header
  // to match. Unset keeps the guard inert for evidence-only embeds/tests.
  operatorToken?: string;
}

const foundryArtifactKinds: readonly FoundryArtifactKind[] = [
  "project-brief",
  "project-brief-decision",
  "intake-turn",
  "export-feedback",
  "architecture-plan",
  "architecture-plan-decision",
  "capability-plan",
  "capability-plan-decision",
  "test-suite",
  "test-suite-decision",
  "work-order",
  "slice-submission",
  "submission-decision",
];

function parseFoundryKind(value: string): FoundryArtifactKind | null {
  return (foundryArtifactKinds as readonly string[]).includes(value)
    ? (value as FoundryArtifactKind)
    : null;
}

function localHostname(value: string): boolean {
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function buildAgentWebServer(
  options: AgentWebServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 1024 * 1024 });
  const operations = options.operations ?? new OperationStore();

  // Returns true when the request was rejected (reply already sent). Any
  // local process can reach 127.0.0.1; operator-attributed writes must
  // additionally present the token only the operator's terminal shows
  // (incident 2026-08-08: a builder session forged a decision by write
  // access alone).
  const rejectWithoutOperatorToken = (
    request: { headers: Record<string, unknown> },
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ): boolean => {
    const expected = options.operatorToken;
    if (!expected) return false;
    if (operatorTokenMatches(expected, request.headers["x-operator-token"])) {
      return false;
    }
    reply.code(401).send({
      error:
        "This action is operator-attributed and requires the operator token. " +
        "It was printed when the console server started (and is stored in .workbench/operator-token). " +
        "Paste it into the form's Operator token field once; this browser will remember it.",
    });
    return true;
  };

  app.addHook("onRequest", async (request, reply) => {
    if (!localHostname(request.hostname)) {
      return reply.code(403).send({ error: "Only loopback hostnames are allowed." });
    }
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (!localHostname(new URL(origin).hostname)) {
          return reply.code(403).send({ error: "Cross-origin requests are denied." });
        }
      } catch {
        return reply.code(403).send({ error: "Invalid request origin." });
      }
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
    );
    return payload;
  });

  app.get("/api/health", async () => ({
    status: "ok",
    apiKeyConfigured: options.apiKeyConfigured,
    workspaceRoot: options.service.workspaceRoot,
    catalogValid: options.service.inventory().valid,
  }));

  app.get("/api/catalog", async () => options.service.inventory());
  app.get("/api/workspaces", async () => ({ workspaces: await options.service.workspaces.list() }));
  app.post("/api/workspaces", async (request, reply) => {
    const parsed = addWorkspaceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(422).send({ error: z.prettifyError(parsed.error) });
    try {
      return reply.code(201).send(await options.service.workspaces.add({
        id: parsed.data.id,
        rootPath: parsed.data.rootPath,
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
      }));
    } catch (error: unknown) {
      return reply.code(409).send({ error: errorMessage(error) });
    }
  });
  app.delete<{ Params: { workspaceId: string } }>("/api/workspaces/:workspaceId", async (request, reply) => {
    try {
      await options.service.workspaces.remove(request.params.workspaceId);
      return reply.code(204).send();
    } catch (error: unknown) {
      return reply.code(409).send({ error: errorMessage(error) });
    }
  });
  app.get("/api/agents", async () => ({ agents: options.service.listAgents() }));
  app.get("/api/tools", async () => ({ tools: options.service.listTools() }));
  app.get<{ Params: { toolId: string } }>("/api/tools/:toolId", async (request, reply) => {
    try {
      return options.service.describeTool(request.params.toolId);
    } catch (error: unknown) {
      return reply.code(404).send({ error: errorMessage(error) });
    }
  });
  app.get<{ Params: { agentId: string } }>("/api/agents/:agentId", async (request, reply) => {
    try {
      return options.service.describeAgent(request.params.agentId);
    } catch (error: unknown) {
      return reply.code(404).send({ error: errorMessage(error) });
    }
  });

  app.get<{ Querystring: { agentId?: string; workspaceId?: string; limit?: string } }>(
    "/api/evaluations",
    async (request, reply) => {
      const limit = request.query.limit === undefined ? undefined : Number(request.query.limit);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        return reply.code(400).send({ error: "limit must be a positive integer." });
      }
      return options.service.listEvaluations({
        ...(request.query.agentId ? { agentId: request.query.agentId } : {}),
        ...(request.query.workspaceId ? { workspaceId: request.query.workspaceId } : {}),
        ...(limit === undefined ? {} : { limit }),
      });
    },
  );
  app.get<{ Querystring: { baselineId?: string; candidateId?: string } }>(
    "/api/evaluations/compare",
    async (request, reply) => {
      if (!request.query.baselineId || !request.query.candidateId) {
        return reply.code(400).send({ error: "baselineId and candidateId are required." });
      }
      try {
        return await options.service.compareEvaluations(
          request.query.baselineId,
          request.query.candidateId,
        );
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );
  app.get<{ Params: { experimentId: string } }>(
    "/api/evaluations/:experimentId",
    async (request, reply) => {
      try {
        return await options.service.getEvaluation(request.params.experimentId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );
  app.post<{ Params: { experimentId: string } }>(
    "/api/evaluations/:experimentId/improvements",
    async (request, reply) => {
      const parsed = improvementRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(422).send({ error: z.prettifyError(parsed.error) });
      }
      if (!options.apiKeyConfigured) {
        return reply.code(503).send({ error: "OPENAI_API_KEY is not configured." });
      }
      try {
        await options.service.getEvaluation(request.params.experimentId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      const operation = operations.start(
        "agent-improvement",
        "agent-improvement-analyst",
        async (emit) => {
          emit("catalog", "Resolved the frozen subject evaluation and read-only analyst.");
          emit("input", "Selected failed-case evidence while withholding hidden expectations.");
          emit("permissions", "Agent Improvement Analyst has no tool permissions.");
          emit("workflow", "Generating a cited, policy-checked improvement proposal.");
          const result = await options.service.analyzeEvaluation({
            experimentId: request.params.experimentId,
            target: parsed.data.target,
            ...(parsed.data.description
              ? { description: parsed.data.description }
              : {}),
            ...(parsed.data.constraints
              ? { constraints: parsed.data.constraints }
              : {}),
            ...(parsed.data.model ? { model: parsed.data.model } : {}),
          });
          emit(
            "assessment",
            result.analysis.policyEvaluation?.message ??
              result.analysis.executionFailure?.message ??
              result.analysis.refusal ??
              "No proposal assessment was produced.",
          );
          emit("persistence", `Improvement proposal saved as ${result.artifactId}.`);
          return result;
        },
      );
      return reply.code(202).send(operation);
    },
  );
  app.post<{ Params: { proposalArtifactId: string } }>(
    "/api/improvement-proposals/:proposalArtifactId/candidate-evaluations",
    async (request, reply) => {
      if (!options.apiKeyConfigured) {
        return reply.code(503).send({ error: "OPENAI_API_KEY is not configured." });
      }
      let agentId: string;
      try {
        const stored = await options.service.artifacts.load(
          request.params.proposalArtifactId,
        );
        if (stored.kind !== "agent-improvement-proposal") {
          return reply.code(404).send({
            error:
              `Artifact ${request.params.proposalArtifactId} is not an improvement proposal.`,
          });
        }
        agentId = stored.artifact.packet.subject.agentId;
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      const operation = operations.start(
        "agent-candidate-evaluation",
        agentId,
        async (emit) => {
          emit(
            "catalog",
            "Resolved the saved proposal, released subject, and declared datasets.",
          );
          emit(
            "input",
            "Validated the candidate-ready patch against the subject-owned revision surface.",
          );
          emit(
            "permissions",
            "Reused the released tool allowlist without permission expansion.",
          );
          emit(
            "workflow",
            "Running baseline and candidate under the proposal's frozen evaluation conditions.",
          );
          const result = await options.service.evaluateImprovementProposal(
            request.params.proposalArtifactId,
          );
          emit(
            "assessment",
            result.evaluation.gates.passed
              ? "All automated promotion gates passed or were not applicable."
              : "One or more automated promotion gates failed.",
          );
          emit(
            "persistence",
            `Candidate comparison saved as ${result.artifactId}.`,
          );
          return result;
        },
      );
      return reply.code(202).send(operation);
    },
  );
  app.post<{ Params: { proposalArtifactId: string } }>(
    "/api/improvement-proposals/:proposalArtifactId/tool-builder-handoffs",
    async (request, reply) => {
      const parsed = toolBuilderHandoffRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!parsed.success) {
        return reply.code(422).send({ error: z.prettifyError(parsed.error) });
      }
      if (!options.apiKeyConfigured) {
        return reply.code(503).send({ error: "OPENAI_API_KEY is not configured." });
      }
      try {
        const stored = await options.service.artifacts.load(
          request.params.proposalArtifactId,
        );
        if (stored.kind !== "agent-improvement-proposal") {
          return reply.code(404).send({
            error:
              `Artifact ${request.params.proposalArtifactId} is not an improvement proposal.`,
          });
        }
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      const operation = operations.start(
        "agent-run",
        "tool-builder",
        async (emit) => {
          emit(
            "catalog",
            "Resolved the saved improvement proposal and proposal-only Tool Builder.",
          );
          emit(
            "input",
            "Derived one cited tool-capability request from immutable proposal evidence.",
          );
          emit(
            "permissions",
            "Forced read-only proposal generation with no Tool Builder tool permissions.",
          );
          emit(
            "workflow",
            "Generating a reviewable tool contract, implementation proposal, and tests.",
          );
          const result =
            await options.service.handoffImprovementToToolBuilder({
              proposalArtifactId: request.params.proposalArtifactId,
              recommendationIndex: parsed.data.recommendationIndex,
            });
          emit(
            "assessment",
            result.run.assessment?.message ??
              "No Tool Builder assessment was produced.",
          );
          emit(
            "persistence",
            `Linked Tool Builder run saved as ${result.artifactId}.`,
          );
          return result;
        },
      );
      return reply.code(202).send(operation);
    },
  );
  app.post<{ Params: { proposalArtifactId: string } }>(
    "/api/improvement-proposals/:proposalArtifactId/change-risk-reviewer-handoffs",
    async (request, reply) => {
      const parsed = changeRiskHandoffRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!parsed.success) {
        return reply.code(422).send({ error: z.prettifyError(parsed.error) });
      }
      if (!options.apiKeyConfigured) {
        return reply.code(503).send({ error: "OPENAI_API_KEY is not configured." });
      }
      try {
        const stored = await options.service.artifacts.load(
          request.params.proposalArtifactId,
        );
        if (stored.kind !== "agent-improvement-proposal") {
          return reply.code(404).send({
            error:
              `Artifact ${request.params.proposalArtifactId} is not an improvement proposal.`,
          });
        }
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      const operation = operations.start(
        "agent-run",
        "change-risk-reviewer",
        async (emit) => {
          emit(
            "catalog",
            "Resolved the saved improvement proposal and read-only Change Risk Reviewer.",
          );
          emit(
            "input",
            "Derived one cited engineering recommendation and fixed its proposal workspace.",
          );
          emit(
            "permissions",
            "Limited inspection to bounded repository and Git evidence without write or command permissions.",
          );
          emit(
            "workflow",
            "Inspecting current staged, unstaged, and untracked workspace changes.",
          );
          const result =
            await options.service.handoffImprovementToChangeRiskReviewer({
              proposalArtifactId: request.params.proposalArtifactId,
              recommendationIndex: parsed.data.recommendationIndex,
              ...(parsed.data.toolBuilderRunArtifactId
                ? {
                    toolBuilderRunArtifactId:
                      parsed.data.toolBuilderRunArtifactId,
                  }
                : {}),
            });
          emit(
            "assessment",
            result.run.assessment?.message ??
              result.run.failure?.message ??
              "No Change Risk assessment was produced.",
          );
          emit(
            "persistence",
            `Linked Change Risk review saved as ${result.artifactId}.`,
          );
          return result;
        },
      );
      return reply.code(202).send(operation);
    },
  );
  app.get<{ Params: { experimentId: string; datasetId: string; caseId: string } }>(
    "/api/evaluations/:experimentId/cases/:datasetId/:caseId",
    async (request, reply) => {
      try {
        return await options.service.getEvaluationCase(
          request.params.experimentId,
          request.params.datasetId,
          request.params.caseId,
        );
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );
  app.get<{ Params: { candidateEvaluationId: string } }>(
    "/api/candidate-evaluations/:candidateEvaluationId",
    async (request, reply) => {
      try {
        return await options.service.getCandidateEvaluation(
          request.params.candidateEvaluationId,
        );
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );
  app.post<{ Params: { candidateEvaluationId: string } }>(
    "/api/candidate-evaluations/:candidateEvaluationId/decisions",
    async (request, reply) => {
      if (rejectWithoutOperatorToken(request, reply)) return undefined;
      const parsed = promotionDecisionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(422).send({ error: z.prettifyError(parsed.error) });
      }
      try {
        const result = await options.service.recordPromotionDecision({
          candidateEvaluationId: request.params.candidateEvaluationId,
          decision: parsed.data.decision,
          operatorId: parsed.data.operatorId,
          rationale: parsed.data.rationale,
          proposalArtifactId: parsed.data.proposalArtifactId ?? null,
        });
        return reply.code(201).send(result);
      } catch (error: unknown) {
        const message = errorMessage(error);
        if (message.includes("is not a candidate evaluation")) {
          return reply.code(404).send({ error: message });
        }
        if (
          message.includes("cannot be approved") ||
          message.includes("is not an improvement proposal") ||
          message.includes("does not match the candidate comparison")
        ) {
          return reply.code(422).send({ error: message });
        }
        return reply.code(400).send({ error: message });
      }
    },
  );
  app.get<{ Params: { experimentId: string; datasetId: string; caseId: string } }>(
    "/api/evaluations/:experimentId/cases/:datasetId/:caseId/draft",
    async (request, reply) => {
      try {
        const datasetCase = await options.service.getEvaluationCase(
          request.params.experimentId,
          request.params.datasetId,
          request.params.caseId,
        );
        return reply
          .header("content-type", "application/json; charset=utf-8")
          .header("content-disposition", `attachment; filename="${datasetCase.datasetCaseId}-dataset-case.json"`)
          .send(`${JSON.stringify({
            id: datasetCase.datasetCaseId,
            input: datasetCase.input,
            ...(datasetCase.expectation === null
              ? {}
              : { expected: datasetCase.expectation }),
          }, null, 2)}\n`);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  app.get<{ Querystring: { kind?: string; agentId?: string; workspaceId?: string; succeeded?: string; limit?: string } }>(
    "/api/artifacts",
    async (request, reply) => {
      const kind = request.query.kind;
      if (kind && kind !== "agent-run" && kind !== "agent-dataset-run" && kind !== "agent-evaluation" && kind !== "agent-candidate-evaluation" && kind !== "agent-improvement-proposal" && kind !== "agent-promotion-decision") {
        return reply.code(400).send({ error: "Unsupported artifact kind." });
      }
      const artifactKind: ArtifactKind | undefined = kind === "agent-run" || kind === "agent-dataset-run" || kind === "agent-evaluation" || kind === "agent-candidate-evaluation" || kind === "agent-improvement-proposal" || kind === "agent-promotion-decision"
        ? kind
        : undefined;
      const succeeded = request.query.succeeded === undefined
        ? undefined
        : request.query.succeeded === "true"
          ? true
          : request.query.succeeded === "false"
            ? false
            : null;
      if (succeeded === null) {
        return reply.code(400).send({ error: "succeeded must be true or false." });
      }
      const limit = request.query.limit === undefined ? undefined : Number(request.query.limit);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        return reply.code(400).send({ error: "limit must be a positive integer." });
      }
      const artifactQuery: ArtifactQuery = {
        ...(artifactKind ? { kind: artifactKind } : {}),
        ...(request.query.agentId ? { agentId: request.query.agentId } : {}),
        ...(request.query.workspaceId ? { workspaceId: request.query.workspaceId } : {}),
        ...(succeeded === undefined ? {} : { succeeded }),
        ...(limit === undefined ? {} : { limit }),
      };
      return options.service.artifacts.list(artifactQuery);
    },
  );

  app.get<{ Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId/presentation",
    async (request, reply) => {
      try {
        return await options.service.presentArtifact(request.params.artifactId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  app.get<{ Params: { artifactId: string }; Querystring: { format?: string } }>(
    "/api/artifacts/:artifactId/export",
    async (request, reply) => {
      if (request.query.format !== "json" && request.query.format !== "markdown") {
        return reply.code(400).send({ error: "format must be json or markdown." });
      }
      try {
        const exported = await options.service.exportArtifact(request.params.artifactId, request.query.format);
        return reply
          .header("content-type", exported.mediaType)
          .header("content-disposition", `attachment; filename="${exported.fileName}"`)
          .send(exported.content);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  app.get<{ Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId/raw",
    async (request, reply) => {
      try {
        const exported = await options.service.exportRawArtifact(request.params.artifactId);
        return reply
          .header("content-type", exported.mediaType)
          .header("content-disposition", `attachment; filename="${exported.fileName}"`)
          .send(exported.content);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  app.get<{ Params: { artifactId: string }; Querystring: { path?: string } }>(
    "/api/artifacts/:artifactId/source",
    async (request, reply) => {
      if (!request.query.path) return reply.code(400).send({ error: "path is required." });
      try {
        return await options.service.getArtifactSource(request.params.artifactId, request.query.path);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  app.get<{ Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId",
    async (request, reply) => {
      try {
        return await options.service.artifacts.load(request.params.artifactId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  if (options.foundry) {
    const foundry = options.foundry;

    app.get("/api/foundry/projects", async () => {
      return buildFoundryProjectIndex(foundry);
    });

    app.get<{ Params: { briefId: string } }>(
      "/api/foundry/projects/:briefId",
      async (request, reply) => {
        const chain = await buildFoundryChainView(foundry, request.params.briefId);
        if (!chain) {
          return reply
            .code(404)
            .send({ error: `Unknown foundry project: ${request.params.briefId}.` });
        }
        return chain;
      },
    );

    app.get<{ Querystring: { kind?: string; briefId?: string; limit?: string } }>(
      "/api/foundry/artifacts",
      async (request, reply) => {
        const kind = request.query.kind
          ? parseFoundryKind(request.query.kind)
          : undefined;
        if (kind === null) {
          return reply.code(400).send({ error: "Unsupported foundry artifact kind." });
        }
        const limit =
          request.query.limit === undefined ? undefined : Number(request.query.limit);
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
          return reply.code(400).send({ error: "limit must be a positive integer." });
        }
        return foundry.list({
          ...(kind ? { kind } : {}),
          ...(request.query.briefId ? { briefId: request.query.briefId } : {}),
          ...(limit === undefined ? {} : { limit }),
        });
      },
    );

    app.get<{ Params: { artifactId: string } }>(
      "/api/foundry/artifacts/:artifactId",
      async (request, reply) => {
        try {
          return await foundry.load(request.params.artifactId);
        } catch (error: unknown) {
          return reply.code(404).send({ error: errorMessage(error) });
        }
      },
    );

    // Shared skeleton for the five decision-recording routes: validate the
    // operator's request, load the target artifact (404 on miss/kind
    // mismatch), then let the decision constructor enforce the approval
    // gates (422 on violation, e.g. "cannot be approved").
    const recordFoundryDecision = async (
      request: { body: unknown; headers: Record<string, unknown> },
      reply: {
        code: (status: number) => { send: (body: unknown) => unknown };
      },
      artifactId: string,
      expectedKind: FoundryArtifactKind,
      build: (
        artifact: never,
        input: {
          decision: "approve" | "reject" | "revise" | "reopen";
          operatorId: string;
          rationale: string;
          requestedRevisions: string[] | null;
        },
      ) => Promise<unknown>,
    ): Promise<unknown> => {
      if (rejectWithoutOperatorToken(request, reply)) return undefined;
      const parsed = foundryDecisionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(422).send({ error: z.prettifyError(parsed.error) });
      }
      let stored;
      try {
        stored = await foundry.load(artifactId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      if (stored.kind !== expectedKind) {
        return reply
          .code(404)
          .send({ error: `Artifact ${artifactId} is not a ${expectedKind}.` });
      }
      try {
        const saved = await build(stored.artifact as never, {
          decision: parsed.data.decision,
          operatorId: parsed.data.operatorId,
          rationale: parsed.data.rationale,
          requestedRevisions:
            parsed.data.requestedRevisions && parsed.data.requestedRevisions.length > 0
              ? parsed.data.requestedRevisions
              : null,
        });
        return reply.code(201).send(saved);
      } catch (error: unknown) {
        return reply.code(422).send({ error: errorMessage(error) });
      }
    };

    app.post<{ Params: { briefId: string; version: string } }>(
      "/api/foundry/briefs/:briefId/versions/:version/decisions",
      async (request, reply) => {
        const version = Number(request.params.version);
        if (!Number.isInteger(version) || version < 1) {
          return reply.code(400).send({ error: "version must be a positive integer." });
        }
        const artifactId = `${request.params.briefId}-v${version}`;
        return recordFoundryDecision(
          request,
          reply,
          artifactId,
          "project-brief",
          async (brief: never, input) => {
            // Delegating to the service keeps the web boundary identical to
            // CLI/MCP — including the reopen guard (approved latest version
            // only, Decision 088).
            const { ProjectBriefService } = await import(
              "../foundry/projectBriefService.js"
            );
            return new ProjectBriefService(foundry).recordDecision({
              briefId: request.params.briefId,
              version,
              ...input,
            });
          },
        );
      },
    );

    app.post<{ Params: { planId: string } }>(
      "/api/foundry/plans/:planId/decisions",
      async (request, reply) =>
        recordFoundryDecision(
          request,
          reply,
          request.params.planId,
          "architecture-plan",
          async (plan: never, input) => {
            const { decision: decisionKind, ...decisionRest } = input;
            if (decisionKind === "reopen") {
              throw new Error("reopen is only valid on project briefs.");
            }
            const decision = createArchitecturePlanDecision({
              plan,
              planArtifactId: request.params.planId,
              decision: decisionKind,
              ...decisionRest,
            });
            const reference = await foundry.saveArchitecturePlanDecision(decision);
            return { decision, reference };
          },
        ),
    );

    app.post<{ Params: { capabilityPlanId: string } }>(
      "/api/foundry/capability-plans/:capabilityPlanId/decisions",
      async (request, reply) =>
        recordFoundryDecision(
          request,
          reply,
          request.params.capabilityPlanId,
          "capability-plan",
          async (capabilityPlan: never, input) => {
            const { decision: decisionKind, ...decisionRest } = input;
            if (decisionKind === "reopen") {
              throw new Error("reopen is only valid on project briefs.");
            }
            const decision = createCapabilityPlanDecision({
              capabilityPlan,
              capabilityPlanArtifactId: request.params.capabilityPlanId,
              decision: decisionKind,
              ...decisionRest,
            });
            const reference = await foundry.saveCapabilityPlanDecision(decision);
            return { decision, reference };
          },
        ),
    );

    app.post<{ Params: { testSuiteId: string } }>(
      "/api/foundry/test-suites/:testSuiteId/decisions",
      async (request, reply) =>
        recordFoundryDecision(
          request,
          reply,
          request.params.testSuiteId,
          "test-suite",
          async (testSuite: never, input) => {
            const { decision: decisionKind, ...decisionRest } = input;
            if (decisionKind === "reopen") {
              throw new Error("reopen is only valid on project briefs.");
            }
            const decision = createTestSuiteDecision({
              testSuite,
              testSuiteArtifactId: request.params.testSuiteId,
              decision: decisionKind,
              ...decisionRest,
            });
            const reference = await foundry.saveTestSuiteDecision(decision);
            return { decision, reference };
          },
        ),
    );

    app.post<{ Params: { submissionId: string } }>(
      "/api/foundry/submissions/:submissionId/decisions",
      async (request, reply) =>
        recordFoundryDecision(
          request,
          reply,
          request.params.submissionId,
          "slice-submission",
          async (submission: never, input) => {
            const { decision: decisionKind, ...decisionRest } = input;
            if (decisionKind === "reopen") {
              throw new Error("reopen is only valid on project briefs.");
            }
            const decision = createSubmissionDecision({
              submission,
              decision: decisionKind,
              ...decisionRest,
            });
            const reference = await foundry.saveSubmissionDecision(decision);
            return { decision, reference };
          },
        ),
    );

    if (options.foundryServices) {
      const stages = options.foundryServices;

      // Model-invoking stages run as tracked operations; the deterministic
      // work-order issuer responds synchronously. Stage gates (approved
      // upstream artifacts, revise-latest-decision) are enforced by the
      // services and surface as failed operations.
      const startStage = (
        reply: { code: (status: number) => { send: (body: unknown) => unknown } },
        agentId: string,
        execute: (
          emit: (stage: "workflow" | "persistence", message: string) => void,
        ) => Promise<unknown>,
        label?: string,
      ): unknown => {
        if (!options.apiKeyConfigured) {
          return reply.code(503).send({ error: "OPENAI_API_KEY is not configured." });
        }
        const stageLabels: Record<string, string> = {
          "project-intake": "Intake interview",
          "project-architect": "Generating the architecture plan",
          "capability-planner": "Generating the capability plan",
          "test-designer": "Designing the acceptance tests",
          "build-completion": "Recording the build completion",
        };
        const operation = operations.start(
          "foundry-stage",
          agentId,
          execute,
          label ?? stageLabels[agentId] ?? agentId,
        );
        return reply.code(202).send(operation);
      };

      // Read model for the operations tray: refresh-safe because the
      // server is the only owner of in-flight state.
      app.get("/api/foundry/operations", async () => ({
        operations: operations
          .listRecent()
          .map(({ operationId, label, agentId, status, createdAt, completedAt }) => ({
            operationId,
            label,
            agentId,
            status,
            createdAt,
            completedAt,
          })),
      }));

      app.post("/api/foundry/intake", async (request, reply) => {
        const parsed = foundryIntakeStartSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(422).send({ error: z.prettifyError(parsed.error) });
        }
        return startStage(reply, "project-intake", async (emit) => {
          emit("workflow", "Starting the intake interview.");
          const result = await stages.intake.startIntake({
            title: parsed.data.title,
            idea: parsed.data.idea,
            ...(parsed.data.maxTurns === undefined
              ? {}
              : { maxTurns: parsed.data.maxTurns }),
          });
          emit("persistence", `Brief ${result.brief.briefId} v${result.brief.version} recorded.`);
          return {
            briefId: result.brief.briefId,
            briefVersion: result.brief.version,
            openQuestionCount: result.brief.openQuestions.length,
          };
        });
      });

      app.post<{ Params: { briefId: string } }>(
        "/api/foundry/intake/:briefId/turns",
        async (request, reply) => {
          const parsed = foundryIntakeTurnSchema.safeParse(request.body ?? {});
          if (!parsed.success) {
            return reply.code(422).send({ error: z.prettifyError(parsed.error) });
          }
          return startStage(reply, "project-intake", async (emit) => {
            emit("workflow", "Applying operator answers to the interview.");
            const result = await stages.intake.runTurn({
              briefId: request.params.briefId,
              answers: parsed.data.answers,
            });
            emit("persistence", `Brief ${result.brief.briefId} v${result.brief.version} recorded.`);
            return {
              briefId: result.brief.briefId,
              briefVersion: result.brief.version,
              openQuestionCount: result.brief.openQuestions.length,
            };
          });
        },
      );

      app.post("/api/foundry/plans", async (request, reply) => {
        const parsed = foundryArchitectRunSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(422).send({ error: z.prettifyError(parsed.error) });
        }
        return startStage(reply, "project-architect", async (emit) => {
          emit("workflow", "Generating the architecture plan.");
          const saved = await stages.architect.createPlan({
            briefId: parsed.data.briefId,
            reviseFromId: parsed.data.reviseFrom,
            evolvesFromCompletionId: parsed.data.evolveFrom,
          });
          emit("persistence", `Plan ${saved.plan.planId} recorded.`);
          return { planId: saved.plan.planId };
        });
      });

      app.post("/api/foundry/capability-plans", async (request, reply) => {
        const parsed = foundryCapabilityRunSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(422).send({ error: z.prettifyError(parsed.error) });
        }
        return startStage(reply, "capability-planner", async (emit) => {
          emit("workflow", "Mapping the plan to capabilities.");
          const saved = await stages.capability.createCapabilityPlan({
            planId: parsed.data.planId,
            reviseFromId: parsed.data.reviseFrom,
          });
          emit("persistence", `Capability plan ${saved.capabilityPlan.capabilityPlanId} recorded.`);
          return { capabilityPlanId: saved.capabilityPlan.capabilityPlanId };
        });
      });

      app.post("/api/foundry/test-suites", async (request, reply) => {
        const parsed = foundryTestDesignRunSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(422).send({ error: z.prettifyError(parsed.error) });
        }
        return startStage(reply, "test-designer", async (emit) => {
          emit("workflow", "Designing acceptance tests.");
          const saved = await stages.testDesign.createTestSuite({
            capabilityPlanId: parsed.data.capabilityPlanId,
            reviseFromId: parsed.data.reviseFrom,
          });
          emit("persistence", `Test suite ${saved.testSuite.testSuiteId} recorded.`);
          return { testSuiteId: saved.testSuite.testSuiteId };
        });
      });

      app.post("/api/foundry/work-orders", async (request, reply) => {
        const parsed = foundryWorkOrderRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(422).send({ error: z.prettifyError(parsed.error) });
        }
        try {
          let sliceId = parsed.data.sliceId;
          if (!sliceId) {
            const next = await stages.workOrders.nextSlice({
              testSuiteId: parsed.data.testSuiteId,
            });
            if (!next) {
              return reply
                .code(200)
                .send({ done: true, message: "Every slice has an approved submission." });
            }
            sliceId = next.sliceId;
          }
          const saved = await stages.workOrders.createWorkOrder({
            testSuiteId: parsed.data.testSuiteId,
            sliceId,
          });
          return reply.code(201).send(saved);
        } catch (error: unknown) {
          return reply.code(422).send({ error: errorMessage(error) });
        }
      });

      app.post("/api/foundry/completions", async (request, reply) => {
        if (rejectWithoutOperatorToken(request, reply)) return undefined;
        const parsed = foundryCompletionRequestSchema.safeParse(
          request.body ?? {},
        );
        if (!parsed.success) {
          return reply.code(422).send({ error: z.prettifyError(parsed.error) });
        }
        const completions = stages.completions;
        if (!completions) {
          return reply
            .code(501)
            .send({ error: "Build completions are not configured on this deployment." });
        }
        return startStage(reply, "build-completion", async (emit) => {
          emit(
            "workflow",
            "Re-running the full approved suite (holdouts included) out-of-tree.",
          );
          const saved = await completions.recordCompletion({
            testSuiteId: parsed.data.testSuiteId,
            projectRoot: parsed.data.projectRoot,
            operatorId: parsed.data.operatorId,
            retroactive: parsed.data.retroactive ?? false,
          });
          emit(
            "persistence",
            `Completion ${saved.completion.completionId} recorded at ${saved.completion.mainCommitSha.slice(0, 12)}.`,
          );
          return { completionId: saved.completion.completionId };
        });
      });
    }
  }

  app.post<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/runs",
    async (request, reply) => {
      const parsed = runRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({ error: z.prettifyError(parsed.error) });
      }
      if (!options.apiKeyConfigured) {
        return reply.code(503).send({ error: "OPENAI_API_KEY is not configured." });
      }
      try {
        options.service.agents.get(request.params.agentId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      const operation = operations.start("agent-run", request.params.agentId, async (emit) => {
        const manifest = options.service.agents.get(request.params.agentId).manifest;
        emit("catalog", `Resolved ${manifest.id}@${manifest.version}.`);
        emit("input", "Input accepted for agent-specific validation.");
        emit("permissions", `${manifest.permissions.toolIds.length} manifest permission(s) supplied to the runner.`);
        emit("workflow", "Agent-owned workflow entered through the shared runner.");
        const result = await options.service.run({
          agentId: request.params.agentId,
          input: parsed.data.input,
          ...(parsed.data.model ? { model: parsed.data.model } : {}),
          ...(parsed.data.workspaceId ? { workspaceId: parsed.data.workspaceId } : {}),
        });
        emit("output", result.run.failure?.stage === "output" ? "Output contract validation failed." : "Output contract evaluated.");
        emit("assessment", result.run.assessment?.message ?? "No goal assessment was produced.");
        emit("persistence", `Run evidence saved as ${result.artifactId}.`);
        return result;
      });
      return reply.code(202).send(operation);
    },
  );

  app.post<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/verifications",
    async (request, reply) => {
      const parsed = verificationRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({ error: z.prettifyError(parsed.error) });
      }
      if (!options.apiKeyConfigured) {
        return reply.code(503).send({ error: "OPENAI_API_KEY is not configured." });
      }
      try {
        options.service.agents.get(request.params.agentId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      const operation = operations.start(
        "agent-verification",
        request.params.agentId,
        async (emit) => {
          emit("catalog", "Resolved the agent's versioned verification policy.");
          emit("workflow", "Executing complete agent dataset cases.");
          const result = await options.service.verify({
            agentId: request.params.agentId,
            repetitions: parsed.data.repetitions,
            concurrency: parsed.data.concurrency,
            ...(parsed.data.model ? { model: parsed.data.model } : {}),
            ...(parsed.data.workspaceId ? { workspaceId: parsed.data.workspaceId } : {}),
          });
          emit("persistence", `${result.datasets.length} dataset artifact(s) and experiment ${result.artifactId} saved.`);
          return result;
        },
      );
      return reply.code(202).send(operation);
    },
  );

  app.get<{ Params: { operationId: string } }>(
    "/api/operations/:operationId",
    async (request, reply) => {
      try {
        return operations.snapshot(request.params.operationId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
    },
  );

  app.get<{ Params: { operationId: string } }>(
    "/api/operations/:operationId/events",
    async (request, reply) => {
      let snapshot;
      try {
        snapshot = operations.snapshot(request.params.operationId);
      } catch (error: unknown) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      for (const event of snapshot.events) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      if (snapshot.status === "completed" || snapshot.status === "failed") {
        reply.raw.end();
        return reply;
      }
      const unsubscribe = operations.subscribe(
        snapshot.operationId,
        (event, terminal) => {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          if (terminal) reply.raw.end();
        },
      );
      request.raw.on("close", unsubscribe);
      return reply;
    },
  );

  if (options.clientDirectory) {
    const root = resolve(options.clientDirectory);
    await access(root);
    await app.register(fastifyStatic, { root });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "API route not found." });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
