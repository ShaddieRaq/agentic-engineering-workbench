export interface WorkflowDescriptor {
  id: string;
  description: string;
}

const workflows: Record<string, WorkflowDescriptor> = {
  "change-risk-review": {
    id: "change-risk-review",
    description: "Inspect repository changes and produce a grounded risk review.",
  },
  "documentation-audit": {
    id: "documentation-audit",
    description: "Inventory repository files, assemble bounded documentation context, and produce a citation-validated audit.",
  },
  "repository-assistant": {
    id: "repository-assistant",
    description: "Inspect, analyze, and verify a local repository.",
  },
  "tool-proposal": {
    id: "tool-proposal",
    description:
      "Generate and deterministically validate a reviewable tool implementation proposal.",
  },
  "playwright-failure-triage": {
    id: "playwright-failure-triage",
    description:
      "Read bounded failure context, optionally run one controlled test, and produce a grounded Playwright diagnosis.",
  },
};

export function getWorkflowDescriptor(id: string): WorkflowDescriptor {
  const descriptor = workflows[id];

  if (!descriptor) {
    throw new Error(`Unknown workflow: ${id}`);
  }

  return descriptor;
}

export function listWorkflowDescriptors(): WorkflowDescriptor[] {
  return Object.values(workflows).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}
