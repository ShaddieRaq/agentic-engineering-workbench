import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findSelfReferentialCriteria } from "../src/foundry/criteriaQuality.js";

function criterion(text: string, verification?: string) {
  return { id: randomUUID(), text, verification };
}

describe("findSelfReferentialCriteria", () => {
  it("flags the live Mac Librarian defect shapes", () => {
    const criteria = [
      criterion(
        "The brief states that the agent analyzes file contents and produces recommended movements.",
        "An independent tester can read the brief and confirm that content analysis is explicitly required.",
      ),
    ];
    const violations = findSelfReferentialCriteria(criteria);
    expect(violations.map(({ field }) => field).sort()).toEqual([
      "text",
      "verification",
    ]);
    expect(violations[0]!.entryId).toBe(criteria[0]!.id);
  });

  it("flags brief-as-subject and stated-in-the-brief constructions", () => {
    expect(
      findSelfReferentialCriteria([
        criterion("This brief documents the approval workflow."),
      ]),
    ).toHaveLength(1);
    expect(
      findSelfReferentialCriteria([
        criterion(
          "Approval batching is required.",
          "Confirm the requirement is stated in the brief.",
        ),
      ]),
    ).toHaveLength(1);
    expect(
      findSelfReferentialCriteria([
        criterion("The brief identifies the product as a local agent."),
      ]),
    ).toHaveLength(1);
  });

  it("does not flag behavioral criteria, even ones about briefs as data", () => {
    expect(
      findSelfReferentialCriteria([
        criterion(
          "The tool collects daily standup notes only from the engineering Slack channel.",
          "An independent tester runs the tool and confirms only engineering-channel messages appear in the collected set.",
        ),
        // A product may legitimately operate ON briefs; behavioral phrasing
        // with the product as subject must pass.
        criterion(
          "The exporter renders the brief as a PDF with one section per goal.",
          "A tester runs the exporter against a sample brief and inspects the produced PDF sections.",
        ),
      ]),
    ).toEqual([]);
  });
});
