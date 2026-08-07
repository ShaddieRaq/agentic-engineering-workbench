// Detects self-referential acceptance criteria — criteria that verify what
// the BRIEF says instead of what the PRODUCT does. Live evidence: the Mac
// Librarian brief (b1c76b2a v8) shipped criteria like "The brief states
// that the agent analyzes file contents..." with verification "read the
// brief and confirm...", which the architect mapped to manual checks, the
// test designer transcribed into document-auditing tests, and the builder
// satisfied by editing BRIEF.md. Criteria must describe observable product
// behavior; this shared detector backs both the hidden dataset expectation
// and the intake reconciler's runtime backstop.

export interface CriterionLike {
  id: string;
  text: string;
  verification?: string | undefined;
}

export interface SelfReferentialCriterionViolation {
  entryId: string;
  field: "text" | "verification";
  matchedText: string;
}

// Precision over recall: a product may legitimately concern briefs or
// documents ("The tool renders the brief as PDF" must NOT match). The
// patterns target the brief-as-subject construction and read-the-brief
// verification steps.
const SELF_REFERENTIAL_PATTERNS: RegExp[] = [
  /\b(?:the|this)\s+brief\s+(?:states|documents|describes|identifies|specifies|requires|notes|mentions|explains|records)\b/i,
  /\bread(?:s|ing)?\s+the\s+brief\b/i,
  /\b(?:stated|documented|described|specified|recorded)\s+in\s+the\s+brief\b/i,
  /^\s*the\s+brief\b/i,
  /\b(?:the|this)\s+documentation\s+(?:states|documents|describes|specifies)\b/i,
];

function matchIn(value: string): string | null {
  for (const pattern of SELF_REFERENTIAL_PATTERNS) {
    const match = pattern.exec(value);
    if (match) return match[0];
  }
  return null;
}

export function findSelfReferentialCriteria(
  criteria: readonly CriterionLike[],
): SelfReferentialCriterionViolation[] {
  const violations: SelfReferentialCriterionViolation[] = [];
  for (const criterion of criteria) {
    const textMatch = matchIn(criterion.text);
    if (textMatch) {
      violations.push({
        entryId: criterion.id,
        field: "text",
        matchedText: textMatch,
      });
    }
    const verificationMatch =
      criterion.verification === undefined
        ? null
        : matchIn(criterion.verification);
    if (verificationMatch) {
      violations.push({
        entryId: criterion.id,
        field: "verification",
        matchedText: verificationMatch,
      });
    }
  }
  return violations;
}
