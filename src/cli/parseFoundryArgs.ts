export interface FoundryCliAnswer {
  questionId: string | null;
  answer: string;
}

export type FoundryCliArgs =
  | { command: "brief-create"; title: string; idea: string }
  | { command: "brief-show"; briefId: string; version: number | null }
  | { command: "brief-list"; briefId: string | null }
  | { command: "brief-lineage"; briefId: string }
  | {
      command: "brief-decide";
      briefId: string;
      version: number;
      decision: "approve" | "reject" | "revise" | "reopen";
      operatorId: string;
      rationale: string;
      requestedRevisions: string[];
    }
  | {
      command: "intake-start";
      title: string;
      idea: string;
      maxTurns: number | null;
      model: string | null;
    }
  | {
      command: "intake-turn";
      briefId: string;
      answers: FoundryCliAnswer[];
      answersFile: string | null;
      model: string | null;
    }
  | { command: "intake-status"; briefId: string }
  | { command: "export-claude-code"; decisionArtifactId: string; out: string | null }
  | { command: "import-feedback"; bundlePath: string; exportDir: string | null }
  | {
      command: "architect-plan";
      briefId: string;
      model: string | null;
      reviseFrom: string | null;
      evolveFrom: string | null;
    }
  | { command: "plan-show"; planId: string }
  | {
      command: "plan-decide";
      planId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions: string[];
    }
  | {
      command: "capability-plan";
      planId: string;
      model: string | null;
      reviseFrom: string | null;
    }
  | { command: "capability-show"; capabilityPlanId: string }
  | {
      command: "capability-decide";
      capabilityPlanId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions: string[];
    }
  | {
      command: "design-tests";
      capabilityPlanId: string;
      model: string | null;
      reviseFrom: string | null;
    }
  | { command: "tests-show"; testSuiteId: string }
  | {
      command: "tests-decide";
      testSuiteId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions: string[];
    }
  | {
      command: "work-order";
      testSuiteId: string;
      sliceId: string | null;
      next: boolean;
    }
  | { command: "work-order-show"; workOrderId: string }
  | { command: "materialize-tests"; workOrderId: string; projectRoot: string }
  | { command: "builder-workspace"; workOrderId: string; projectRoot: string }
  | { command: "submit-slice"; workOrderId: string; projectRoot: string }
  | {
      command: "submission-decide";
      submissionId: string;
      decision: "approve" | "reject" | "revise";
      operatorId: string;
      rationale: string;
      requestedRevisions: string[];
    }
  | {
      command: "record-completion";
      testSuiteId: string;
      projectRoot: string;
      operatorId: string;
      retroactive: boolean;
    };

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);

  if (index === -1) return null;

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name);

  if (value === null) {
    throw new Error(`Missing required ${name}.`);
  }

  return value;
}

function repeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}.`);
    }
    values.push(value);
  }

  return values;
}

function versionOption(args: string[], name: string): number | null {
  const raw = option(args, name);
  if (raw === null) return null;

  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return version;
}

export function parseFoundryArgs(args: string[]): FoundryCliArgs {
  const command = args[0];

  if (command === "brief-create") {
    return {
      command,
      title: requiredOption(args, "--title"),
      idea: requiredOption(args, "--idea"),
    };
  }

  if (command === "brief-show") {
    return {
      command,
      briefId: requiredOption(args, "--brief-id"),
      version: versionOption(args, "--version"),
    };
  }

  if (command === "brief-list") {
    return { command, briefId: option(args, "--brief-id") };
  }

  if (command === "brief-lineage") {
    return { command, briefId: requiredOption(args, "--brief-id") };
  }

  if (command === "brief-decide") {
    const decision = requiredOption(args, "--decision");
    if (
      decision !== "approve" &&
      decision !== "reject" &&
      decision !== "revise" &&
      decision !== "reopen"
    ) {
      throw new Error("--decision must be one of: approve, reject, revise, reopen.");
    }
    const version = versionOption(args, "--version");
    if (version === null) {
      throw new Error("Missing required --version.");
    }

    return {
      command,
      briefId: requiredOption(args, "--brief-id"),
      version,
      decision,
      operatorId: requiredOption(args, "--operator"),
      rationale: requiredOption(args, "--rationale"),
      requestedRevisions: repeatedOption(args, "--revision"),
    };
  }

  if (command === "intake-start") {
    return {
      command,
      title: requiredOption(args, "--title"),
      idea: requiredOption(args, "--idea"),
      maxTurns: versionOption(args, "--max-turns"),
      model: option(args, "--model"),
    };
  }

  if (command === "intake-turn") {
    const answers = repeatedOption(args, "--answer").map((value) => {
      const separator = value.indexOf("=");
      if (separator <= 0 || separator === value.length - 1) {
        throw new Error(
          '--answer must use the form "<questionId>=<text>" or "new=<text>".',
        );
      }
      const questionId = value.slice(0, separator);
      return {
        questionId: questionId === "new" ? null : questionId,
        answer: value.slice(separator + 1),
      };
    });
    const answersFile = option(args, "--answers-file");

    if (answers.length === 0 && answersFile === null) {
      throw new Error(
        "intake-turn requires at least one --answer or an --answers-file.",
      );
    }

    return {
      command,
      briefId: requiredOption(args, "--brief-id"),
      answers,
      answersFile,
      model: option(args, "--model"),
    };
  }

  if (command === "intake-status") {
    return { command, briefId: requiredOption(args, "--brief-id") };
  }

  if (command === "export-claude-code") {
    return {
      command,
      decisionArtifactId: requiredOption(args, "--decision"),
      out: option(args, "--out"),
    };
  }

  if (command === "import-feedback") {
    return {
      command,
      bundlePath: requiredOption(args, "--bundle"),
      exportDir: option(args, "--export-dir"),
    };
  }

  if (command === "architect-plan") {
    return {
      command,
      briefId: requiredOption(args, "--brief-id"),
      model: option(args, "--model"),
      reviseFrom: option(args, "--revise-from"),
      evolveFrom: option(args, "--evolve-from"),
    };
  }

  if (command === "plan-show") {
    return { command, planId: requiredOption(args, "--plan-id") };
  }

  if (command === "plan-decide") {
    const decision = requiredOption(args, "--decision");
    if (decision !== "approve" && decision !== "reject" && decision !== "revise") {
      throw new Error("--decision must be one of: approve, reject, revise.");
    }
    return {
      command,
      planId: requiredOption(args, "--plan-id"),
      decision,
      operatorId: requiredOption(args, "--operator"),
      rationale: requiredOption(args, "--rationale"),
      requestedRevisions: repeatedOption(args, "--revision"),
    };
  }

  if (command === "capability-plan") {
    return {
      command,
      planId: requiredOption(args, "--plan-id"),
      model: option(args, "--model"),
      reviseFrom: option(args, "--revise-from"),
    };
  }

  if (command === "capability-show") {
    return {
      command,
      capabilityPlanId: requiredOption(args, "--capability-plan-id"),
    };
  }

  if (command === "capability-decide") {
    const decision = requiredOption(args, "--decision");
    if (decision !== "approve" && decision !== "reject" && decision !== "revise") {
      throw new Error("--decision must be one of: approve, reject, revise.");
    }
    return {
      command,
      capabilityPlanId: requiredOption(args, "--capability-plan-id"),
      decision,
      operatorId: requiredOption(args, "--operator"),
      rationale: requiredOption(args, "--rationale"),
      requestedRevisions: repeatedOption(args, "--revision"),
    };
  }

  if (command === "design-tests") {
    return {
      command,
      capabilityPlanId: requiredOption(args, "--capability-plan-id"),
      model: option(args, "--model"),
      reviseFrom: option(args, "--revise-from"),
    };
  }

  if (command === "tests-show") {
    return { command, testSuiteId: requiredOption(args, "--test-suite-id") };
  }

  if (command === "tests-decide") {
    const decision = requiredOption(args, "--decision");
    if (decision !== "approve" && decision !== "reject" && decision !== "revise") {
      throw new Error("--decision must be one of: approve, reject, revise.");
    }
    return {
      command,
      testSuiteId: requiredOption(args, "--test-suite-id"),
      decision,
      operatorId: requiredOption(args, "--operator"),
      rationale: requiredOption(args, "--rationale"),
      requestedRevisions: repeatedOption(args, "--revision"),
    };
  }

  if (command === "work-order") {
    const sliceId = option(args, "--slice-id");
    const next = args.includes("--next");
    if (!sliceId && !next) {
      throw new Error("work-order requires --slice-id <id> or --next.");
    }
    return {
      command,
      testSuiteId: requiredOption(args, "--test-suite-id"),
      sliceId,
      next,
    };
  }

  if (command === "work-order-show") {
    return { command, workOrderId: requiredOption(args, "--work-order-id") };
  }

  if (command === "materialize-tests") {
    return {
      command,
      workOrderId: requiredOption(args, "--work-order-id"),
      projectRoot: requiredOption(args, "--project-root"),
    };
  }

  if (command === "builder-workspace") {
    return {
      command,
      workOrderId: requiredOption(args, "--work-order-id"),
      projectRoot: requiredOption(args, "--project-root"),
    };
  }

  if (command === "submit-slice") {
    return {
      command,
      workOrderId: requiredOption(args, "--work-order-id"),
      projectRoot: requiredOption(args, "--project-root"),
    };
  }

  if (command === "record-completion") {
    return {
      command,
      testSuiteId: requiredOption(args, "--test-suite-id"),
      projectRoot: requiredOption(args, "--project-root"),
      operatorId: requiredOption(args, "--operator"),
      retroactive: args.includes("--retroactive"),
    };
  }

  if (command === "submission-decide") {
    const decision = requiredOption(args, "--decision");
    if (decision !== "approve" && decision !== "reject" && decision !== "revise") {
      throw new Error("--decision must be one of: approve, reject, revise.");
    }
    return {
      command,
      submissionId: requiredOption(args, "--submission-id"),
      decision,
      operatorId: requiredOption(args, "--operator"),
      rationale: requiredOption(args, "--rationale"),
      requestedRevisions: repeatedOption(args, "--revision"),
    };
  }

  throw new Error(
    "Expected one of: brief-create --title <title> --idea <summary>, " +
      "brief-show --brief-id <id> [--version <n>], brief-list [--brief-id <id>], " +
      "brief-lineage --brief-id <id>, brief-decide --brief-id <id> --version <n> " +
      "--decision <approve|reject|revise> --operator <id> --rationale <text> [--revision <text> ...], " +
      "intake-start --title <title> --idea <summary> [--max-turns <n>] [--model <id>], " +
      'intake-turn --brief-id <id> [--answer "<questionId>=<text>"] ... [--answers-file <path>] [--model <id>], ' +
      "intake-status --brief-id <id>, " +
      "export-claude-code --decision <artifact-id> [--out <directory>], " +
      "import-feedback --bundle <path> [--export-dir <directory>], " +
      "architect-plan --brief-id <id> [--model <id>] [--evolve-from <completionId>], plan-show --plan-id <id>, " +
      "plan-decide --plan-id <id> --decision <approve|reject|revise> --operator <id> --rationale <text> [--revision <text> ...], " +
      "capability-plan --plan-id <id> [--model <id>], capability-show --capability-plan-id <id>, " +
      "capability-decide --capability-plan-id <id> --decision <approve|reject|revise> --operator <id> --rationale <text> [--revision <text> ...], " +
      "design-tests --capability-plan-id <id> [--model <id>], tests-show --test-suite-id <id>, " +
      "tests-decide --test-suite-id <id> --decision <approve|reject|revise> --operator <id> --rationale <text> [--revision <text> ...], " +
      "work-order --test-suite-id <id> (--slice-id <id> | --next), work-order-show --work-order-id <id>, " +
      "materialize-tests --work-order-id <id> --project-root <path>, submit-slice --work-order-id <id> --project-root <path>, " +
      "builder-workspace --work-order-id <id> --project-root <path>, " +
      "submission-decide --submission-id <id> --decision <approve|reject|revise> --operator <id> --rationale <text> [--revision <text> ...], " +
      "record-completion --test-suite-id <id> --project-root <path> --operator <id> [--retroactive].",
  );
}
