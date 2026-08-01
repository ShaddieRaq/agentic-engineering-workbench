import type { RepositoryContextAssembly } from "./repositoryContextLoader.js";
import type { RepositoryAnalysisOutput } from "./repositoryAnalysisOutput.js";

export interface RepositoryAnalysisCitationEvaluation {
  evaluatorId: "repository-evidence-paths";
  passed: boolean;
  availablePaths: string[];
  citedPaths: string[];
  invalidPaths: string[];
  message: string;
}

function uniqueSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function evaluateRepositoryAnalysisCitations(
  output: RepositoryAnalysisOutput,
  context: RepositoryContextAssembly,
): RepositoryAnalysisCitationEvaluation {
  const availablePaths = uniqueSorted(
    context.items.map(({ source }) => source),
  );
  const citedPaths = uniqueSorted([
    ...output.architectureComponents.flatMap(
      ({ evidencePaths }) => evidencePaths,
    ),
    ...output.entryPoints.flatMap(({ evidencePaths }) => evidencePaths),
    ...output.risks.flatMap(({ evidencePaths }) => evidencePaths),
    ...output.recommendedTests.flatMap(
      ({ evidencePaths }) => evidencePaths,
    ),
  ]);
  const availablePathSet = new Set(availablePaths);
  const invalidPaths = citedPaths.filter(
    (path) => !availablePathSet.has(path),
  );

  return {
    evaluatorId: "repository-evidence-paths",
    passed: invalidPaths.length === 0,
    availablePaths,
    citedPaths,
    invalidPaths,
    message:
      invalidPaths.length === 0
        ? "Every analysis citation references assembled context."
        : `Analysis cites unavailable context paths: ${invalidPaths.join(", ")}.`,
  };
}
