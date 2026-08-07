import { createHash } from "node:crypto";
import type { ProjectBrief } from "./projectBrief.js";
import type { TestSuite } from "./testSuite.js";

// Decision 088 suite succession: an evolution suite is a FULL suite whose
// relationship to the prior approved suite is rule-governed and validated
// deterministically — the designer proposes, this module disposes.
//
// Rules:
// - A prior file covering ONLY unchanged criteria is carried byte-exact
//   (content, coveredCriterionIds, testType).
// - A prior file touching a changed or retired criterion may be revised in
//   place (same path) or retired (absent) when nothing it covered remains.
// - Disclosure is one-way: a prior holdout may be deliberately promoted to
//   visible; a prior visible path may NEVER become a holdout.
// - Holdouts accumulate: exactly priorHoldoutCount + 1 in the new suite.

export interface CriteriaDiff {
  unchangedIds: Set<string>;
  changedIds: Set<string>;
  newIds: Set<string>;
  retiredIds: Set<string>;
}

export function diffAcceptanceCriteria(
  priorBrief: ProjectBrief,
  currentBrief: ProjectBrief,
): CriteriaDiff {
  const prior = new Map(
    priorBrief.acceptanceCriteria.map((criterion) => [criterion.id, criterion]),
  );
  const current = new Map(
    currentBrief.acceptanceCriteria.map((criterion) => [
      criterion.id,
      criterion,
    ]),
  );

  const unchangedIds = new Set<string>();
  const changedIds = new Set<string>();
  const newIds = new Set<string>();
  const retiredIds = new Set<string>();

  for (const [id, criterion] of current) {
    const before = prior.get(id);
    if (!before) {
      newIds.add(id);
    } else if (
      before.text === criterion.text &&
      before.verification === criterion.verification
    ) {
      unchangedIds.add(id);
    } else {
      changedIds.add(id);
    }
  }
  for (const id of prior.keys()) {
    if (!current.has(id)) retiredIds.add(id);
  }
  return { unchangedIds, changedIds, newIds, retiredIds };
}

export interface SuiteFileLineage {
  path: string;
  lineage: "carried" | "revised" | "new";
  priorContentDigest: string | null;
}

export interface SuiteSuccession {
  fileLineage: SuiteFileLineage[];
  retiredFilePaths: string[];
}

function contentDigest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function validateSuiteSuccession(input: {
  priorSuiteContent: TestSuite["content"];
  content: TestSuite["content"];
  diff: CriteriaDiff;
}): SuiteSuccession {
  const failures: string[] = [];
  const priorFiles = new Map(
    input.priorSuiteContent.testFiles.map((file) => [file.path, file]),
  );
  const newFiles = new Map(
    input.content.testFiles.map((file) => [file.path, file]),
  );

  const fileLineage: SuiteFileLineage[] = [];
  const retiredFilePaths: string[] = [];

  for (const [path, prior] of priorFiles) {
    const successor = newFiles.get(path);
    const coversOnlyUnchanged = prior.coveredCriterionIds.every((id) =>
      input.diff.unchangedIds.has(id),
    );

    if (!successor) {
      if (coversOnlyUnchanged) {
        failures.push(
          `File ${path} covers only unchanged criteria and must be carried byte-exact, but it is missing from the suite.`,
        );
      } else if (
        prior.coveredCriterionIds.some((id) => input.diff.unchangedIds.has(id))
      ) {
        failures.push(
          `File ${path} covers unchanged criteria and cannot be retired; carry or revise it in place.`,
        );
      } else {
        retiredFilePaths.push(path);
      }
      continue;
    }

    // One-way disclosure: visible never becomes holdout.
    if (prior.visibility === "visible" && successor.visibility === "holdout") {
      failures.push(
        `File ${path} was visible and cannot become a holdout; disclosure is one-way.`,
      );
    }

    const identical =
      successor.content === prior.content &&
      successor.testType === prior.testType &&
      sameIdSet(successor.coveredCriterionIds, prior.coveredCriterionIds);

    if (coversOnlyUnchanged) {
      if (!identical) {
        failures.push(
          `File ${path} covers only unchanged criteria and must be carried byte-exact (content, coveredCriterionIds, testType).`,
        );
        continue;
      }
      fileLineage.push({
        path,
        lineage: "carried",
        priorContentDigest: contentDigest(prior.content),
      });
    } else {
      fileLineage.push({
        path,
        lineage: identical ? "carried" : "revised",
        priorContentDigest: contentDigest(prior.content),
      });
    }
  }

  for (const [path] of newFiles) {
    if (!priorFiles.has(path)) {
      fileLineage.push({ path, lineage: "new", priorContentDigest: null });
    }
  }

  const priorHoldouts = input.priorSuiteContent.testFiles.filter(
    ({ visibility }) => visibility === "holdout",
  ).length;
  const newHoldouts = input.content.testFiles.filter(
    ({ visibility }) => visibility === "holdout",
  ).length;
  if (newHoldouts !== priorHoldouts + 1) {
    failures.push(
      `Expected exactly ${priorHoldouts + 1} holdout file(s) (prior ${priorHoldouts} + 1 new) but found ${newHoldouts}.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`Suite succession rejected: ${failures.join(" ")}`);
  }
  return {
    fileLineage: fileLineage.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    retiredFilePaths: retiredFilePaths.sort(),
  };
}
