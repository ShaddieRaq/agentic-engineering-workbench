import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProjectBrief } from "../src/foundry/projectBrief.js";
import type { TestSuite } from "../src/foundry/testSuite.js";
import {
  diffAcceptanceCriteria,
  validateSuiteSuccession,
} from "../src/foundry/testSuiteSuccession.js";

const UNCHANGED_ID = randomUUID();
const CHANGED_ID = randomUUID();
const RETIRED_ID = randomUUID();
const NEW_ID = randomUUID();

function brief(
  criteria: { id: string; text: string; verification: string }[],
  retired: string[] = [],
): ProjectBrief {
  return {
    briefId: "eeeeeee1-0000-4000-8000-00000000000e",
    version: 1,
    title: "Example",
    ideaSummary: "An example.",
    goals: [],
    users: [],
    constraints: [],
    risks: [],
    nonGoals: [],
    assumptions: [],
    acceptanceCriteria: criteria.map((criterion) => ({
      ...criterion,
      source: "user-stated" as const,
    })),
    openQuestions: [],
    ...(retired.length > 0 ? { retiredCriterionIds: retired } : {}),
    previousVersionArtifactId: null,
    previousVersionDigest: null,
    createdAt: "2026-08-07T00:00:00.000Z",
  };
}

const PRIOR_BRIEF = brief([
  { id: UNCHANGED_ID, text: "Stable behavior.", verification: "Run and check." },
  { id: CHANGED_ID, text: "Old wording.", verification: "Old check." },
  { id: RETIRED_ID, text: "Dropped behavior.", verification: "Old check." },
]);
const CURRENT_BRIEF = brief(
  [
    { id: UNCHANGED_ID, text: "Stable behavior.", verification: "Run and check." },
    { id: CHANGED_ID, text: "New wording.", verification: "New check." },
    { id: NEW_ID, text: "Brand new behavior.", verification: "Run and verify." },
  ],
  [RETIRED_ID],
);

function file(
  overrides: Partial<TestSuite["content"]["testFiles"][number]> & {
    path: string;
  },
): TestSuite["content"]["testFiles"][number] {
  return {
    content: "import { it } from 'vitest';\nit('x', () => {});\n",
    visibility: "visible",
    coveredCriterionIds: [UNCHANGED_ID],
    testType: "integration",
    ...overrides,
  };
}

const PRIOR_FILES = {
  stable: file({ path: "acceptance-tests/stable.test.ts" }),
  changed: file({
    path: "acceptance-tests/changed.test.ts",
    coveredCriterionIds: [CHANGED_ID],
    content: "old content",
  }),
  dropped: file({
    path: "acceptance-tests/dropped.test.ts",
    coveredCriterionIds: [RETIRED_ID],
  }),
  holdout: file({
    path: "acceptance-tests/hidden.test.ts",
    visibility: "holdout",
    coveredCriterionIds: [UNCHANGED_ID],
  }),
};

function suiteContent(
  testFiles: TestSuite["content"]["testFiles"],
): TestSuite["content"] {
  return {
    interfaceContract: "node ./dist/cli.js; exit 0.",
    testFiles,
    manualChecks: [],
    concerns: [],
  };
}

const PRIOR = suiteContent(Object.values(PRIOR_FILES));
const DIFF = diffAcceptanceCriteria(PRIOR_BRIEF, CURRENT_BRIEF);

const NEW_HOLDOUT = file({
  path: "acceptance-tests/hidden-2.test.ts",
  visibility: "holdout",
  coveredCriterionIds: [NEW_ID],
});
const NEW_VISIBLE = file({
  path: "acceptance-tests/brand-new.test.ts",
  coveredCriterionIds: [NEW_ID],
});

describe("diffAcceptanceCriteria", () => {
  it("classifies unchanged, changed, new, and retired ids", () => {
    expect([...DIFF.unchangedIds]).toEqual([UNCHANGED_ID]);
    expect([...DIFF.changedIds]).toEqual([CHANGED_ID]);
    expect([...DIFF.newIds]).toEqual([NEW_ID]);
    expect([...DIFF.retiredIds]).toEqual([RETIRED_ID]);
  });
});

describe("validateSuiteSuccession", () => {
  it("accepts a lawful successor and computes lineage", () => {
    const succession = validateSuiteSuccession({
      priorSuiteContent: PRIOR,
      content: suiteContent([
        PRIOR_FILES.stable,
        PRIOR_FILES.holdout,
        { ...PRIOR_FILES.changed, content: "revised content" },
        NEW_VISIBLE,
        NEW_HOLDOUT,
      ]),
      diff: DIFF,
    });
    const byPath = new Map(
      succession.fileLineage.map(({ path, lineage }) => [path, lineage]),
    );
    expect(byPath.get(PRIOR_FILES.stable.path)).toBe("carried");
    expect(byPath.get(PRIOR_FILES.changed.path)).toBe("revised");
    expect(byPath.get(NEW_VISIBLE.path)).toBe("new");
    expect(succession.retiredFilePaths).toEqual([PRIOR_FILES.dropped.path]);
  });

  it("rejects drift on files covering only unchanged criteria", () => {
    expect(() =>
      validateSuiteSuccession({
        priorSuiteContent: PRIOR,
        content: suiteContent([
          { ...PRIOR_FILES.stable, content: "sneaky rewrite" },
          PRIOR_FILES.holdout,
          PRIOR_FILES.changed,
          NEW_HOLDOUT,
        ]),
        diff: DIFF,
      }),
    ).toThrow(/must be carried byte-exact/);

    expect(() =>
      validateSuiteSuccession({
        priorSuiteContent: PRIOR,
        content: suiteContent([
          PRIOR_FILES.holdout,
          PRIOR_FILES.changed,
          NEW_HOLDOUT,
        ]),
        diff: DIFF,
      }),
    ).toThrow(/missing from the suite/);
  });

  it("enforces one-way disclosure and the prior+1 holdout count", () => {
    // Visible → holdout is forbidden.
    expect(() =>
      validateSuiteSuccession({
        priorSuiteContent: PRIOR,
        content: suiteContent([
          { ...PRIOR_FILES.stable, visibility: "holdout" },
          PRIOR_FILES.holdout,
          PRIOR_FILES.changed,
          NEW_HOLDOUT,
        ]),
        diff: DIFF,
      }),
    ).toThrow(/disclosure is one-way/);

    // Holdout → visible promotion is allowed (still needs prior+1 holdouts).
    const promoted = validateSuiteSuccession({
      priorSuiteContent: PRIOR,
      content: suiteContent([
        PRIOR_FILES.stable,
        { ...PRIOR_FILES.holdout, visibility: "visible" },
        PRIOR_FILES.changed,
        NEW_HOLDOUT,
        {
          ...NEW_HOLDOUT,
          path: "acceptance-tests/hidden-3.test.ts",
        },
      ]),
      diff: DIFF,
    });
    expect(
      promoted.fileLineage.find(
        ({ path }) => path === PRIOR_FILES.holdout.path,
      )?.lineage,
    ).toBe("carried");

    // Wrong holdout count fails with the expected arithmetic.
    expect(() =>
      validateSuiteSuccession({
        priorSuiteContent: PRIOR,
        content: suiteContent([
          PRIOR_FILES.stable,
          PRIOR_FILES.holdout,
          PRIOR_FILES.changed,
        ]),
        diff: DIFF,
      }),
    ).toThrow(/Expected exactly 2 holdout file\(s\)/);
  });
});
