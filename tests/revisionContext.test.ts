import { describe, expect, it } from "vitest";
import {
  renderRevisionSection,
  revisionContextSchema,
} from "../src/foundry/revisionContext.js";

describe("revisionContextSchema", () => {
  it("accepts a valid context and rejects empty revisions", () => {
    expect(() =>
      revisionContextSchema.parse({
        previous: { overview: "prior" },
        requestedRevisions: ["Fix the import."],
      }),
    ).not.toThrow();
    expect(() =>
      revisionContextSchema.parse({
        previous: {},
        requestedRevisions: [],
      }),
    ).toThrowError();
    expect(() =>
      revisionContextSchema.parse({
        previous: {},
        requestedRevisions: ["ok"],
        surprise: true,
      }),
    ).toThrowError();
  });
});

describe("renderRevisionSection", () => {
  it("contains the prior content and every requested revision", () => {
    const section = renderRevisionSection({
      previous: { overview: "the prior plan" },
      requestedRevisions: ["Fix the import.", "Ratify the filename."],
    }).join("\n");

    expect(section).toContain("REVISION REQUEST:");
    expect(section).toContain("the prior plan");
    expect(section).toContain("- Fix the import.");
    expect(section).toContain("- Ratify the filename.");
    expect(section).toContain("complete replacement");
  });
});
