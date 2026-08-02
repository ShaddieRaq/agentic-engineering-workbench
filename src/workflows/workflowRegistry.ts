export interface WorkflowDescriptor {
  id: string;
  description: string;
}

const workflows: Record<string, WorkflowDescriptor> = {
  "change-risk-review": {
    id: "change-risk-review",
    description: "Inspect repository changes and produce a grounded risk review.",
  },
  "repository-assistant": {
    id: "repository-assistant",
    description: "Inspect, analyze, and verify a local repository.",
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
