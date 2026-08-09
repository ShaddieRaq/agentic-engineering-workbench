import { randomUUID } from "node:crypto";

export type OperationKind =
  | "agent-run"
  | "agent-verification"
  | "agent-improvement"
  | "agent-candidate-evaluation"
  | "foundry-stage";
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
  // Human-facing description shown in the operations tray ("Designing
  // acceptance tests"). Falls back to the agent id when absent.
  label: string;
  status: OperationStatus;
  events: OperationEvent[];
  result: unknown | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  // Failed operations stay pinned in the tray until the operator
  // acknowledges them (field-trial verdict 2026-08-09: silent failures
  // read as flaky triggers).
  acknowledged: boolean;
}

type Subscriber = (event: OperationEvent, terminal: boolean) => void;

export class OperationStore {
  readonly #operations = new Map<string, OperationSnapshot>();
  readonly #subscribers = new Map<string, Set<Subscriber>>();

  start(
    kind: OperationKind,
    agentId: string,
    execute: (emit: (stage: OperationEvent["stage"], message: string) => void) => Promise<unknown>,
    label?: string,
  ): OperationSnapshot {
    const operation: OperationSnapshot = {
      operationId: randomUUID(),
      kind,
      agentId,
      label: label ?? agentId,
      status: "queued",
      events: [],
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      acknowledged: false,
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

  // Read model for the operations tray (console UX settlement): every
  // queued/running operation, every unacknowledged failure, then recently
  // settled ones, newest first — a page refresh reconstructs in-flight
  // work from server state alone, and failures cannot silently scroll
  // away.
  listRecent(limit = 10): OperationSnapshot[] {
    const all = [...this.#operations.values()];
    const active = all
      .filter(({ status }) => status === "queued" || status === "running")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const pinnedFailures = all
      .filter(({ status, acknowledged }) => status === "failed" && !acknowledged)
      .sort(
        (left, right) =>
          (right.completedAt ?? "").localeCompare(left.completedAt ?? ""),
      );
    const pinnedIds = new Set(pinnedFailures.map(({ operationId }) => operationId));
    const settled = all
      .filter(
        ({ status, operationId }) =>
          (status === "completed" || status === "failed") &&
          !pinnedIds.has(operationId),
      )
      .sort(
        (left, right) =>
          (right.completedAt ?? "").localeCompare(left.completedAt ?? ""),
      )
      .slice(0, Math.max(limit - active.length - pinnedFailures.length, 3));
    return [...active, ...pinnedFailures, ...settled].map((operation) =>
      structuredClone(operation),
    );
  }

  // Operator dismissal of a failed operation. Completed operations age out
  // naturally and need no acknowledgement.
  acknowledge(id: string): OperationSnapshot {
    const operation = this.#operations.get(id);
    if (!operation) throw new Error(`Unknown operation: ${id}`);
    if (operation.status !== "failed") {
      throw new Error(
        `Operation ${id} is ${operation.status}; only failed operations need acknowledgement.`,
      );
    }
    operation.acknowledged = true;
    return this.snapshot(id);
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
