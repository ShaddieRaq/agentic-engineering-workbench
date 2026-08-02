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
  })
  .strict();

const verificationRequestSchema = z
  .object({
    repetitions: z.number().int().positive().default(1),
    concurrency: z.number().int().positive().max(10).default(1),
    model: z.string().min(1).optional(),
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
  app.get("/api/agents", async () => ({ agents: options.service.listAgents() }));
  app.get<{ Params: { agentId: string } }>("/api/agents/:agentId", async (request, reply) => {
    try {
      return options.service.describeAgent(request.params.agentId);
    } catch (error: unknown) {
      return reply.code(404).send({ error: errorMessage(error) });
    }
  });

  app.get<{ Querystring: { kind?: string; agentId?: string; succeeded?: string; limit?: string } }>(
    "/api/artifacts",
    async (request, reply) => {
      const kind = request.query.kind;
      if (kind && kind !== "agent-run" && kind !== "agent-dataset-run") {
        return reply.code(400).send({ error: "Unsupported artifact kind." });
      }
      const artifactKind: ArtifactKind | undefined = kind === "agent-run" || kind === "agent-dataset-run"
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
        ...(succeeded === undefined ? {} : { succeeded }),
        ...(limit === undefined ? {} : { limit }),
      };
      return options.service.artifacts.list(artifactQuery);
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
          });
          emit("persistence", `${result.length} verification artifact(s) saved.`);
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
