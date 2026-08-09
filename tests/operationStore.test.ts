import { describe, expect, it } from "vitest";
import { OperationStore } from "../src/web/operationStore.js";

async function settled(store: OperationStore, id: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = store.snapshot(id);
    if (snapshot.status === "completed" || snapshot.status === "failed") {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Operation did not settle.");
}

describe("OperationStore failure pinning", () => {
  it("keeps failed operations listed until acknowledged, past the recency cap", async () => {
    const store = new OperationStore();
    const failed = store.start("foundry-stage", "project-architect", async () => {
      throw new Error("Gate refused: brief has unresolved entries.");
    });
    await settled(store, failed.operationId);

    // Bury the failure under more completions than the cap keeps.
    for (let index = 0; index < 15; index += 1) {
      const op = store.start("foundry-stage", "project-intake", async () => "ok");
      await settled(store, op.operationId);
    }

    const listed = store.listRecent(10);
    const pinned = listed.find(
      ({ operationId }) => operationId === failed.operationId,
    );
    expect(pinned).toBeDefined();
    expect(pinned!.status).toBe("failed");
    expect(pinned!.acknowledged).toBe(false);

    store.acknowledge(failed.operationId);
    expect(
      store
        .listRecent(10)
        .find(({ operationId }) => operationId === failed.operationId),
    ).toBeUndefined();
  });

  it("refuses to acknowledge operations that did not fail", async () => {
    const store = new OperationStore();
    const ok = store.start("foundry-stage", "project-intake", async () => "ok");
    await settled(store, ok.operationId);
    expect(() => store.acknowledge(ok.operationId)).toThrow(
      /only failed operations/,
    );
    expect(() => store.acknowledge("unknown-id")).toThrow(/Unknown operation/);
  });
});
