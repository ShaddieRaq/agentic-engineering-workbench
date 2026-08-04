import { access } from "node:fs/promises";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgentApplicationService } from "../agents/agentApplicationService.js";
import type { ArtifactKind, ArtifactQuery } from "../artifacts/artifactStore.js";
import { OperationStore } from "./operationStore.js";

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

export interface AgentWebServerOptions {
  service: AgentApplicationService;
  apiKeyConfigured: boolean;
  operations?: OperationStore;
  clientDirectory?: string;
  logger?: boolean;
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
