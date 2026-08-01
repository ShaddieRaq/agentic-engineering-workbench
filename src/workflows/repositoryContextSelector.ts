import type { ListFilesOutput } from "../tools/listFilesTool.js";
import type { InspectGitDiffOutput } from "../tools/inspectGitDiffTool.js";
import type { ToolCallEvidence } from "../tools/toolExecutor.js";

export interface RepositoryContextCandidate {
  path: string;
  priority: number;
  rationale: string;
}

export interface RepositoryContextSelection {
  selectionId: "repository-orientation";
  sourceToolCallId: string;
  changeToolCallId: string;
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
  changeEvidence: ToolCallEvidence<InspectGitDiffOutput>,
): RepositoryContextSelection {
  const observedFiles = new Set(
    (fileEvidence.output?.entries ?? [])
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.path),
  );

  const observedOrientation = orientationPolicy.filter((candidate) =>
    observedFiles.has(candidate.path),
  );
  const agentInstructions = observedOrientation.filter(
    ({ path }) => path === "AGENTS.md",
  );
  const changedCandidates = changeEvidence.succeeded && changeEvidence.output
    ? [
        ...changeEvidence.output.trackedPaths.map((path) => ({
          path,
          priority: 0,
          rationale: "Tracked working-tree file selected for change analysis.",
        })),
        ...changeEvidence.output.untrackedPaths.map((path) => ({
          path,
          priority: 0,
          rationale: "Untracked working-tree file selected for change analysis.",
        })),
      ]
    : [];
  const selectedPaths = new Set(agentInstructions.map(({ path }) => path));
  const uniqueChangedCandidates = changedCandidates.filter(({ path }) => {
    if (selectedPaths.has(path)) {
      return false;
    }

    selectedPaths.add(path);
    return true;
  });
  const remainingOrientation = observedOrientation.filter(({ path }) => {
    if (selectedPaths.has(path)) {
      return false;
    }

    selectedPaths.add(path);
    return true;
  });
  const candidates = [
    ...agentInstructions,
    ...uniqueChangedCandidates,
    ...remainingOrientation,
  ].map((candidate, index) => ({
    ...candidate,
    priority: index + 1,
  }));

  return {
    selectionId: "repository-orientation",
    sourceToolCallId: fileEvidence.toolCallId,
    changeToolCallId: changeEvidence.toolCallId,
    candidates,
    complete:
      fileEvidence.succeeded &&
      fileEvidence.output?.truncated === false &&
      changeEvidence.succeeded,
  };
}
