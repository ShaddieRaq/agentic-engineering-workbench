import type { ListFilesOutput } from "../tools/listFilesTool.js";
import type { ToolCallEvidence } from "../tools/toolExecutor.js";

export interface RepositoryContextCandidate {
  path: string;
  priority: number;
  rationale: string;
}

export interface RepositoryContextSelection {
  selectionId: "repository-orientation";
  sourceToolCallId: string;
  candidates: RepositoryContextCandidate[];
  complete: boolean;
}

const orientationPolicy: RepositoryContextCandidate[] = [
  {
    path: "AGENTS.md",
    priority: 1,
    rationale: "Repository-specific agent instructions.",
  },
  {
    path: "PROJECT_HANDOFF.md",
    priority: 2,
    rationale: "Current project state and immediate development direction.",
  },
  {
    path: "README.md",
    priority: 3,
    rationale: "Project purpose and operator-facing usage.",
  },
  {
    path: "package.json",
    priority: 4,
    rationale: "Runtime dependencies and executable project commands.",
  },
  {
    path: "tsconfig.json",
    priority: 5,
    rationale: "TypeScript compiler and module configuration.",
  },
];

export function selectRepositoryContext(
  fileEvidence: ToolCallEvidence<ListFilesOutput>,
): RepositoryContextSelection {
  const observedFiles = new Set(
    (fileEvidence.output?.entries ?? [])
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.path),
  );

  return {
    selectionId: "repository-orientation",
    sourceToolCallId: fileEvidence.toolCallId,
    candidates: orientationPolicy.filter((candidate) =>
      observedFiles.has(candidate.path),
    ),
    complete:
      fileEvidence.succeeded &&
      fileEvidence.output?.truncated === false,
  };
}
