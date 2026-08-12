import type { AgentDatasetDefinition } from "./agentDatasetDefinition.js";

const FIXED_CREATED_AT = "2026-08-12T00:00:00.000Z";
const FIXED_DIGEST = "a".repeat(64);

// Minimal-but-valid architecture-plan fixtures. Inputs are inferred (not
// ArchitecturePlan-annotated) so the JSON-typed dataset input accepts them.
function slice(id: string, title: string, delivers: string, criterionId: string) {
  return {
    id,
    title,
    delivers,
    dependsOnSliceIds: [],
    verifiedByCriterionIds: [criterionId],
  };
}

function planInput(args: {
  planId: string;
  briefId: string;
  overview: string;
  componentId: string;
  componentName: string;
  componentResponsibility: string;
  criterionId: string;
  criterionText: string;
  slices: ReturnType<typeof slice>[];
  catalog: {
    agents: { id: string; description: string }[];
    tools: { id: string; description: string }[];
  };
}) {
  return {
    plan: {
      planId: args.planId,
      briefId: args.briefId,
      briefVersion: 1,
      briefArtifactId: `brief-${args.briefId}`,
      briefDigest: FIXED_DIGEST,
      agentRunArtifactId: null,
      reconciliation: null,
      createdAt: FIXED_CREATED_AT,
      content: {
        overview: args.overview,
        components: [
          {
            id: args.componentId,
            name: args.componentName,
            responsibility: args.componentResponsibility,
            dependsOnComponentIds: [],
          },
        ],
        decisions: [],
        acceptancePlan: [
          {
            criterionId: args.criterionId,
            testType: "integration",
            verificationApproach: args.criterionText,
            independentOfImplementation: true,
          },
        ],
        implementationSlices: args.slices,
        concerns: [],
      },
    },
    catalog: args.catalog,
  };
}

// A — the project's need is exactly what a catalog AGENT already does, so the
// planner should reuse it, not reinvent it or propose a new capability.
const reusePlan = planInput({
  planId: "a1000000-0000-4000-8000-000000000001",
  briefId: "a1000000-0000-4000-8000-0000000000b1",
  overview:
    "A concierge that interviews a user's software idea into a structured, " +
    "decision-ready project brief before any building begins.",
  componentId: "a1000000-0000-4000-8000-0000000000c1",
  componentName: "Interview flow",
  componentResponsibility:
    "Runs a structured requirements interview and emits a project brief.",
  criterionId: "a1000000-0000-4000-8000-0000000000d1",
  criterionText:
    "A completed interview yields a structured brief with goals and criteria.",
  slices: [
    slice(
      "a1000000-0000-4000-8000-0000000000e1",
      "Interview the idea into a brief",
      "Conducts a structured requirements interview and produces a decision-ready brief.",
      "a1000000-0000-4000-8000-0000000000d1",
    ),
  ],
  catalog: {
    agents: [
      {
        id: "project-intake",
        description:
          "Interviews a software idea into a decision-ready project brief through structured questions.",
      },
    ],
    tools: [],
  },
});

// B — an ordinary CLI with an empty catalog: nothing to reuse, no engineering
// change, no fabricated capabilities — everything is project-code.
const projectCodePlan = planInput({
  planId: "b1000000-0000-4000-8000-000000000001",
  briefId: "b1000000-0000-4000-8000-0000000000b1",
  overview:
    "A command-line tool that saves short text snippets with tags and lists " +
    "them by tag, all in a local JSON file.",
  componentId: "b1000000-0000-4000-8000-0000000000c1",
  componentName: "Snippet store",
  componentResponsibility: "Persists tagged snippets in a local JSON file.",
  criterionId: "b1000000-0000-4000-8000-0000000000d1",
  criterionText: "A saved snippet can be listed by any of its tags.",
  slices: [
    slice(
      "b1000000-0000-4000-8000-0000000000e1",
      "Save and list snippets by tag",
      "Stores tagged snippets and returns tag-filtered listings.",
      "b1000000-0000-4000-8000-0000000000d1",
    ),
  ],
  catalog: { agents: [], tools: [] },
});

// C — a core need that ordinary code cannot satisfy and no catalog entry
// covers (delivering SMS requires an external messaging capability), so the
// planner must recognize the gap and propose a capability to build/acquire.
const gapPlan = planInput({
  planId: "c1000000-0000-4000-8000-000000000001",
  briefId: "c1000000-0000-4000-8000-0000000000b1",
  overview:
    "A reminder tool that sends users an SMS text message to their phone " +
    "when a task is due.",
  componentId: "c1000000-0000-4000-8000-0000000000c1",
  componentName: "SMS dispatcher",
  componentResponsibility:
    "Delivers due-task reminders to the user's phone as SMS text messages.",
  criterionId: "c1000000-0000-4000-8000-0000000000d1",
  criterionText: "A due task results in an SMS delivered to the user's phone.",
  slices: [
    slice(
      "c1000000-0000-4000-8000-0000000000e1",
      "Send an SMS when a task is due",
      "Delivers a text message to the user's phone number at the due time.",
      "c1000000-0000-4000-8000-0000000000d1",
    ),
  ],
  catalog: {
    agents: [],
    tools: [
      {
        id: "filesystem-read",
        description: "Read files within an allowed workspace root.",
      },
    ],
  },
});

// D — a mixed plan: ordinary storage is project-code, but extracting amounts
// from receipt IMAGES needs an OCR capability the catalog lacks. The planner
// must keep the ordinary work as project-code AND propose the gap, not
// collapse both into one bucket.
const mixedPlan = planInput({
  planId: "d1000000-0000-4000-8000-000000000001",
  briefId: "d1000000-0000-4000-8000-0000000000b1",
  overview:
    "A receipt filer that stores expense records locally and extracts the " +
    "amount and vendor from a photographed receipt image.",
  componentId: "d1000000-0000-4000-8000-0000000000c1",
  componentName: "Expense record store",
  componentResponsibility:
    "Persists parsed expense records and extracts fields from receipt images.",
  criterionId: "d1000000-0000-4000-8000-0000000000d1",
  criterionText: "A filed receipt stores the correct amount and vendor.",
  slices: [
    slice(
      "d1000000-0000-4000-8000-0000000000e1",
      "Store expense records locally",
      "Persists parsed expense records to a local JSON file.",
      "d1000000-0000-4000-8000-0000000000d1",
    ),
    slice(
      "d1000000-0000-4000-8000-0000000000e2",
      "Extract amount and vendor from a receipt image",
      "Reads a photographed receipt and extracts the amount and vendor text.",
      "d1000000-0000-4000-8000-0000000000d1",
    ),
  ],
  catalog: {
    agents: [],
    tools: [
      {
        id: "filesystem-read",
        description: "Read files within an allowed workspace root.",
      },
    ],
  },
});

// Ground truth calibrated by an adversarial panel (one proposer + two skeptics
// per case, 2026-08-12). The first draft over-asserted: it required the planner
// to reuse a catalog agent, to propose a capability for an SMS gap, and forbade
// blocking concerns on a plan that plausibly warranted one — and the STRONG
// model failed it MORE than the weak one, the classic miscalibrated-test tell.
// The reuse-vs-build call is genuinely context-dependent (a standalone product
// can reasonably build its own capability OR reuse a catalog one; SMS can
// reasonably be project-code, an engineering change, or a proposal), so this
// dataset gates only the UNAMBIGUOUS floor that every competent plan meets and
// leaves the judgment calls unasserted rather than penalizing sophistication.
export const capabilityPlannerDataset: AgentDatasetDefinition = {
  id: "capability-planner-smoke",
  description:
    "Unambiguous-floor cases for the capability-planner agent: ordinary work " +
    "stays project-code, no fabricated capabilities on a feasible plan, no " +
    "hallucinated reuse of a catalog entry that is not there, and no false " +
    "blocking concern on a feasible plan. The context-dependent reuse-vs-build " +
    "judgment is deliberately NOT gated (an adversarial panel found it too " +
    "ambiguous to assert without penalizing a competent planner). A judgment " +
    "dataset for cross-model measurement, not a hard release gate.",
  agentId: "capability-planner",
  purpose: "development",
  cases: [
    {
      // A feasible plan whose need may be reused OR built as project-code —
      // both defensible, so neither is asserted. What holds either way: no
      // blocking concern (it is feasible) and no fabricated capability (the
      // need is not a genuine gap).
      id: "feasible-plan-fabricates-nothing",
      input: reusePlan,
      expected: {
        maxProposedCapabilities: 0,
        forbidBlockingConcerns: true,
      },
    },
    {
      // The unambiguous case: ordinary work against an empty catalog is
      // project-code, with nothing to reuse, propose, or block.
      id: "ordinary-work-stays-project-code",
      input: projectCodePlan,
      expected: {
        requireResolutions: ["project-code"],
        forbidResolutions: ["existing-agent", "existing-tool", "engineering-change-required"],
        maxProposedCapabilities: 0,
        forbidBlockingConcerns: true,
      },
    },
    {
      // A novel service need (SMS). How it resolves is a judgment call, but the
      // catalog has NO agents, so resolving it to an existing-agent is
      // hallucinated reuse; and the feature is feasible, so no blocking concern.
      id: "novel-need-stays-feasible-without-hallucinated-reuse",
      input: gapPlan,
      expected: {
        forbidResolutions: ["existing-agent"],
        forbidBlockingConcerns: true,
      },
    },
    {
      // A mixed plan whose storage slice is unmistakably ordinary code; the OCR
      // slice's resolution is a judgment call and is left unasserted.
      id: "mixed-plan-keeps-ordinary-work-as-project-code",
      input: mixedPlan,
      expected: {
        requireResolutions: ["project-code"],
      },
    },
  ],
};
