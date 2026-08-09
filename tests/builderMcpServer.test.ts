import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { FoundryArtifactStore } from "../src/foundry/foundryArtifactStore.js";
import { createSubmissionDecision } from "../src/foundry/sliceSubmission.js";
import {
  SubmissionService,
  type SubmissionTestRunner,
} from "../src/foundry/submissionService.js";
import type { TestSuite } from "../src/foundry/testSuite.js";
import { WorkOrderService } from "../src/foundry/workOrderService.js";
import { buildBuilderMcpServer } from "../src/mcp/builderMcpServer.js";
import type { BuilderMcpDependencies } from "../src/mcp/builderMcpTools.js";
import {
  persistFoundryChain,
  persistSliceTwoWorkOrder,
  type PersistedFoundryChain,
} from "./helpers/foundryWebFixture.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  createdDirectories.length = 0;
});

const HOLDOUT_SECRET = "SECRET holdout expectation: streak resets after gaps";

function scriptedRunner(chain: PersistedFoundryChain): SubmissionTestRunner {
  return {
    async runTestFile({ testFile }) {
      if (testFile === chain.fixture.filePaths.holdout) {
        return {
          exitCode: 0,
          passed: true,
          output: `${HOLDOUT_SECRET}\nexpect(streak).toBe(0)`,
        };
      }
      if (testFile === chain.fixture.filePaths.visibleOnly) {
        // Adversarial: a visible test printing a literal holdout header line.
        // The safe failure direction is over-redaction of what follows.
        return {
          exitCode: 0,
          passed: true,
          output: `PASS routing checks\n--- ${chain.fixture.filePaths.holdout}\nthis trailing line is sacrificed`,
        };
      }
      return { exitCode: 0, passed: true, output: "PASS history checks" };
    },
  };
}

async function builderHarness() {
  const storeDirectory = await mkdtemp(join(tmpdir(), "builder-store-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "builder-project-"));
  createdDirectories.push(storeDirectory, projectRoot);

  const store = new FoundryArtifactStore(storeDirectory);
  const chain = await persistFoundryChain(store);
  const { workOrderId } = await persistSliceTwoWorkOrder(store, chain);

  const testDesign = {
    async loadTestSuite(testSuiteId: string): Promise<TestSuite> {
      const stored = await store.load(testSuiteId);
      if (stored.kind !== "test-suite") {
        throw new Error(`Artifact ${testSuiteId} is not a test suite.`);
      }
      return stored.artifact;
    },
    async deriveTestSuiteStatus(): Promise<
      "draft" | "approved" | "rejected" | "revision-requested"
    > {
      throw new Error("Not part of the builder channel.");
    },
  };
  const workOrders = new WorkOrderService({
    testDesign,
    architect: {
      async loadPlan() {
        throw new Error("Not part of the builder channel.");
      },
    },
    briefs: {
      async loadBrief() {
        throw new Error("Not part of the builder channel.");
      },
    },
    store,
  });
  const submissions = new SubmissionService({
    workOrders,
    testDesign,
    store,
    runner: scriptedRunner(chain),
  });
  const deps: BuilderMcpDependencies = {
    store,
    workOrders,
    submissions,
    testDesign,
    projectRoot,
  };

  const server = buildBuilderMcpServer(deps, "0.0.0-test");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "builder-test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return JSON.parse(content[0]!.text) as unknown;
  };

  return { store, chain, workOrderId, projectRoot, server, client, call };
}

describe("builder MCP server", () => {
  it("exposes exactly the eight builder tools", async () => {
    const harness = await builderHarness();
    const listed = await harness.client.listTools();
    expect(listed.tools.map(({ name }) => name).sort()).toEqual([
      "ask_operator",
      "get_operator_answer",
      "get_submission",
      "get_work_order",
      "list_open_work_orders",
      "materialize_tests",
      "post_builder_note",
      "submit_slice",
    ].sort());
    await harness.client.close();
    await harness.server.close();
  });

  it("carries builder speech as artifacts: notes, questions, and polled answers (Decision 090)", async () => {
    const harness = await builderHarness();

    // A note lands as an artifact with chain identity from the work order.
    const posted = (await harness.call("post_builder_note", {
      workOrderId: harness.workOrderId,
      note: "Batch grouping converges after the second pass; disclosing a semantic change in the apply loop.",
    })) as { noteId: string };
    const storedNote = await harness.store.load(posted.noteId);
    expect(storedNote.kind).toBe("builder-note");
    if (storedNote.kind === "builder-note") {
      expect(storedNote.artifact.briefId).toBe(harness.chain.fixture.brief.briefId);
      expect(storedNote.artifact.sliceId).toBe(harness.chain.fixture.sliceIds.second);
    }

    // A question is pending until the operator answers; the builder polls.
    const asked = (await harness.call("ask_operator", {
      workOrderId: harness.workOrderId,
      question: "The interface contract names no exit code for stale batch ids — treat skips as success?",
    })) as { questionId: string; status: string };
    expect(asked.status).toBe("pending");
    expect((await harness.call("get_operator_answer", {
      questionId: asked.questionId,
    })) as object).toEqual({ status: "pending" });

    const question = await harness.store.load(asked.questionId);
    expect(question.kind).toBe("builder-question");
    if (question.kind === "builder-question") {
      await harness.store.saveOperatorAnswer({
        answerId: "6b1f8a3c-7d2e-4f10-9a5b-1c2d3e4f5a6b",
        questionId: question.artifact.questionId,
        briefId: question.artifact.briefId,
        briefVersion: question.artifact.briefVersion,
        operatorId: "rashad",
        answer: "Yes — stale ids skip gracefully with exit 0; that is the ratified contract.",
        answeredAt: new Date().toISOString(),
      });
    }
    const answered = (await harness.call("get_operator_answer", {
      questionId: asked.questionId,
    })) as { status: string; answer?: string; operatorId?: string };
    expect(answered.status).toBe("answered");
    expect(answered.operatorId).toBe("rashad");
    expect(answered.answer).toContain("exit 0");

    // Non-question artifact ids are refused (MCP surfaces it as a tool
    // error, not a thrown exception).
    const errorResult = await harness.client.callTool({
      name: "get_operator_answer",
      arguments: { questionId: harness.chain.testSuiteId },
    });
    expect(errorResult.isError).toBe(true);
    expect(JSON.stringify(errorResult.content)).toContain(
      "is not a builder question",
    );

    await harness.client.close();
    await harness.server.close();
  });

  it("closes the channel when workspace integrity fails (v1.2 confinement)", async () => {
    const storeDirectory = await mkdtemp(join(tmpdir(), "builder-store-"));
    const projectRoot = await mkdtemp(join(tmpdir(), "builder-project-"));
    createdDirectories.push(storeDirectory, projectRoot);
    const store = new FoundryArtifactStore(storeDirectory);
    const chain = await persistFoundryChain(store);
    const { workOrderId } = await persistSliceTwoWorkOrder(store, chain);
    const testDesign = {
      async loadTestSuite(testSuiteId: string): Promise<TestSuite> {
        const stored = await store.load(testSuiteId);
        if (stored.kind !== "test-suite") {
          throw new Error(`Artifact ${testSuiteId} is not a test suite.`);
        }
        return stored.artifact;
      },
      async deriveTestSuiteStatus(): Promise<
        "draft" | "approved" | "rejected" | "revision-requested"
      > {
        throw new Error("Not part of the builder channel.");
      },
    };
    const workOrders = new WorkOrderService({
      testDesign,
      architect: {
        async loadPlan() {
          throw new Error("Not part of the builder channel.");
        },
      },
      briefs: {
        async loadBrief() {
          throw new Error("Not part of the builder channel.");
        },
      },
      store,
    });
    const submissions = new SubmissionService({
      workOrders,
      testDesign,
      store,
      runner: scriptedRunner(chain),
    });
    // workbenchRoot set + no scaffolded guardrails in projectRoot: every
    // tool refuses.
    const server = buildBuilderMcpServer(
      {
        store,
        workOrders,
        submissions,
        testDesign,
        projectRoot,
        workbenchRoot: "/fake/workbench/root",
      },
      "0.0.0-test",
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "builder-test-client", version: "0.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      name: "get_work_order",
      arguments: { workOrderId },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      "Workspace integrity check failed",
    );

    await client.close();
    await server.close();
  });

  it("redacts holdout paths from work orders and open lists", async () => {
    const harness = await builderHarness();
    const holdoutPath = harness.chain.fixture.filePaths.holdout;

    const view = (await harness.call("get_work_order", {
      workOrderId: harness.workOrderId,
    })) as { visibleTestFilePaths: string[]; holdoutTestFileCount: number };
    expect(view.visibleTestFilePaths.sort()).toEqual(
      [
        harness.chain.fixture.filePaths.visibleOnly,
        harness.chain.fixture.filePaths.crossSlice,
      ].sort(),
    );
    expect(view.holdoutTestFileCount).toBe(1);
    expect(JSON.stringify(view)).not.toContain(holdoutPath);

    // Slice 1 is approved in the fixture; a digest-stale duplicate is
    // silently retired. Only the live slice-2 order remains.
    await persistSliceTwoWorkOrder(harness.store, harness.chain, {
      testSuiteDigest: "f".repeat(64),
      createdAt: "2026-08-05T13:00:00.000Z",
    });
    const open = (await harness.call("list_open_work_orders")) as {
      workOrders: { workOrderId: string }[];
    };
    expect(open.workOrders.map(({ workOrderId }) => workOrderId)).toEqual([
      harness.workOrderId,
    ]);
    expect(JSON.stringify(open)).not.toContain(holdoutPath);

    await harness.client.close();
    await harness.server.close();
  });

  it("verifies a slice with holdout output and paths withheld", async () => {
    const harness = await builderHarness();
    const holdoutPath = harness.chain.fixture.filePaths.holdout;

    const materialized = (await harness.call("materialize_tests", {
      workOrderId: harness.workOrderId,
    })) as { written: string[] };
    expect(materialized.written).not.toContain(holdoutPath);

    const result = (await harness.call("submit_slice", {
      workOrderId: harness.workOrderId,
      report:
        "Disclosure: the apply loop now snapshots before moving; no semantic change to routing.",
    })) as {
      submissionId: string;
      status: string;
      files: { path: string; visibility: string; passed: boolean }[];
      visibleOutputExcerpt: string;
    };
    expect(result.status).toBe("passed");
    const holdoutRow = result.files.find(({ visibility }) => visibility === "holdout");
    expect(holdoutRow?.path).toBe("holdout-1");
    expect(holdoutRow?.passed).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(holdoutPath);
    expect(serialized).not.toContain(HOLDOUT_SECRET);
    expect(result.visibleOutputExcerpt).toContain("PASS routing checks");
    expect(result.visibleOutputExcerpt).toContain("[output withheld]");
    // The adversarial fake header sacrifices its trailing visible line —
    // over-redaction is the accepted failure direction.
    expect(result.visibleOutputExcerpt).not.toContain("this trailing line is sacrificed");

    // The full evidence, including holdout output, still reaches the store
    // for the operator — and the builder's report rides with it
    // (Decision 090).
    const stored = await harness.store.load(result.submissionId);
    expect(stored.kind).toBe("slice-submission");
    expect(JSON.stringify(stored.artifact)).toContain(HOLDOUT_SECRET);
    if (stored.kind === "slice-submission") {
      expect(stored.artifact.builderReport).toContain("snapshots before moving");
    }

    await harness.client.close();
    await harness.server.close();
  });

  it("aggregates holdout scope failures and passes decisions verbatim", async () => {
    const harness = await builderHarness();
    const holdoutPath = harness.chain.fixture.filePaths.holdout;

    await harness.call("materialize_tests", { workOrderId: harness.workOrderId });
    // A stranded holdout file (e.g. crash leftover) must not be named back
    // to the builder.
    await writeFile(
      join(harness.projectRoot, holdoutPath),
      "// stranded holdout\n",
      "utf8",
    );
    const failed = (await harness.call("submit_slice", {
      workOrderId: harness.workOrderId,
    })) as {
      submissionId: string;
      status: string;
      scopeCheck: { passed: boolean; failures: string[] };
    };
    expect(failed.status).toBe("failed");
    const failures = failed.scopeCheck.failures.join(" ");
    expect(failures).not.toContain(holdoutPath);
    expect(failures).toMatch(/1 withheld holdout test file\(s\).*resubmit/);

    const submission = await harness.store.load(failed.submissionId);
    if (submission.kind !== "slice-submission") throw new Error("wrong kind");
    await harness.store.saveSubmissionDecision(
      createSubmissionDecision({
        submission: submission.artifact,
        decision: "revise",
        operatorId: "rashad",
        rationale: "Remove the stray file under acceptance-tests/.",
        requestedRevisions: ["Delete files you did not author, then resubmit."],
        decidedAt: "2026-08-05T14:00:00.000Z",
      }),
    );
    const fetched = (await harness.call("get_submission", {
      submissionId: failed.submissionId,
    })) as {
      latestDecision: { decision: string; requestedRevisions: string[] | null };
    };
    expect(fetched.latestDecision.decision).toBe("revise");
    expect(fetched.latestDecision.requestedRevisions).toEqual([
      "Delete files you did not author, then resubmit.",
    ]);

    await harness.client.close();
    await harness.server.close();
  });
});
