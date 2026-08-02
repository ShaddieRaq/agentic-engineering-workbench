import { randomUUID } from "node:crypto";

export type OperationKind = "agent-run" | "agent-verification";
export type OperationStatus = "queued" | "running" | "completed" | "failed";

export interface OperationEvent {
  sequence: number;
  stage:
    | "queued"
    | "catalog"
    | "input"
    | "permissions"
    | "workflow"
    | "output"
    | "assessment"
    | "execution"
    | "persistence"
    | "completed"
    | "failed";
  message: string;
  occurredAt: string;
}

export interface OperationSnapshot {
  operationId: string;
  kind: OperationKind;
  agentId: string;
  status: OperationStatus;
  events: OperationEvent[];
  result: unknown | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

type Subscriber = (event: OperationEvent, terminal: boolean) => void;

export class OperationStore {
  readonly #operations = new Map<string, OperationSnapshot>();
  readonly #subscribers = new Map<string, Set<Subscriber>>();

  start(
    kind: OperationKind,
    agentId: string,
    execute: (emit: (stage: OperationEvent["stage"], message: string) => void) => Promise<unknown>,
  ): OperationSnapshot {
    const operation: OperationSnapshot = {
      operationId: randomUUID(),
      kind,
      agentId,
      status: "queued",
      events: [],
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    this.#operations.set(operation.operationId, operation);
    this.#emit(operation, "queued", "Operation accepted by the local platform.");

    void Promise.resolve().then(async () => {
      operation.status = "running";
      this.#emit(operation, "execution", "Agent execution started.");

      try {
        operation.result = await execute((stage, message) =>
          this.#emit(operation, stage, message),
        );
        operation.status = "completed";
        operation.completedAt = new Date().toISOString();
        this.#emit(operation, "completed", "Operation completed with persisted evidence.");
      } catch (error: unknown) {
        operation.status = "failed";
        operation.error = error instanceof Error ? error.message : String(error);
        operation.completedAt = new Date().toISOString();
        this.#emit(operation, "failed", operation.error);
      }
    });

    return this.snapshot(operation.operationId);
  }

  snapshot(id: string): OperationSnapshot {
    const operation = this.#operations.get(id);
    if (!operation) throw new Error(`Unknown operation: ${id}`);
    return structuredClone(operation);
  }

  subscribe(id: string, subscriber: Subscriber): () => void {
    this.snapshot(id);
    const subscribers = this.#subscribers.get(id) ?? new Set<Subscriber>();
    subscribers.add(subscriber);
    this.#subscribers.set(id, subscribers);
    return () => subscribers.delete(subscriber);
  }

  #emit(
    operation: OperationSnapshot,
    stage: OperationEvent["stage"],
    message: string,
  ): void {
    const event: OperationEvent = {
      sequence: operation.events.length + 1,
      stage,
      message,
      occurredAt: new Date().toISOString(),
    };
    operation.events.push(event);
    const terminal = operation.status === "completed" || operation.status === "failed";
    for (const subscriber of this.#subscribers.get(operation.operationId) ?? []) {
      subscriber(event, terminal);
    }
    if (terminal) this.#subscribers.delete(operation.operationId);
  }
}
