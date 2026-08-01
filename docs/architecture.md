# Architecture

## System Description

Agentic Engineering Workbench is a local platform for developing reusable agent harnesses and measuring their reliability.

The system keeps model behavior separate from the code that controls:

- role instructions
- tasks
- context
- providers
- evaluation
- evidence
- execution policy

## Current Execution Flow

```text
CLI arguments
    |
    v
Harness registry ------> Harness definition
    |
    v
Role loader -----------> RoleSpec
Task loader -----------> TaskSpec
Context loader --------> ContextItem[]
    |
    v
Prompt builder
    |
    v
SimpleHarness
    |
    +------> AIProvider
    |           |
    |           +------> OpenAIProvider
    |           +------> FakeProvider
    |
    +------> Evaluator[]
    |
    v
HarnessResult
    |
    v
Run writer
    |
    v
runs/run-<uuid>.json
```

Dataset execution uses a separate CLI entry point:

```text
Dataset CLI arguments
    |
    v
Dataset registry ------> Scenario resolution
    |
    v
Dataset executor adapter
    |
    +------> Role + harness definition + AIProvider
    |
    v
ScenarioDatasetRunner
    |
    +------> repeated, bounded-concurrency SimpleHarness runs
    |
    v
ScenarioDatasetRunResult
    |
    v
runs/dataset-run-<uuid>.json
```

The aggregate artifact retains dataset case IDs, complete `HarnessResult`
evidence, and case summaries together. This prevents persistence from losing
the relationship between a run and the dataset input that produced it.

Reliability experiments run the same registered dataset twice through separate
baseline and candidate role configurations. The harness, scenario evaluation
policy, provider, repetition count, and concurrency limit remain fixed. A pure
comparison maps matching case summaries to improved, regressed, unchanged, or
insufficient-evidence classifications.

The experiment artifact contains the validated definition, complete baseline
and candidate dataset results, per-case comparisons, and completion time. The
exact loaded role instructions also remain embedded in every `HarnessResult`,
so evidence does not depend only on mutable file paths.

## Main Components

### AI Provider

The provider abstracts model access.

Current implementations:

- `OpenAIProvider`
- `FakeProvider`

The harness depends on `AIProvider`, not directly on the OpenAI SDK.

This allows:

- isolated tests
- provider replacement
- model comparison later
- cleaner architecture

The provider accepts a request containing:

```ts
{
  prompt,
  outputSchema?
}
```

Plain-text requests use the normal response path. Requests with an output
schema use provider-supported structured generation.

Provider results keep execution evidence separate:

```ts
{
  rawOutput,
  parsedOutput,
  refusal
}
```

`OpenAIProvider` translates Zod schemas through the OpenAI structured-output
helper. Provider request and result types carry the schema output type through
generic `TOutput` parameters. `FakeProvider` returns deterministic provider
results for offline tests.

Known SDK connection and parsing errors are translated into provider-neutral
`AIProviderError` categories. `SimpleHarness` records those failures, and
unclassified provider exceptions, as run evidence.

### Role

A role defines behavioral instructions.

Example:

```text
technical-coach
```

A role describes how the model should behave, not what specific task it should complete.

Roles are loaded from Markdown.

### Task

A task defines the requested work.

Examples:

```text
connection-check
explain-agentic-harness
```

Tasks are loaded from Markdown and validated with Zod.

### Context

Context contains supporting information supplied to the model.

Each context item includes:

```ts
{
  id,
  source,
  content
}
```

Context is explicit and recorded in the run result.

This supports future context-engineering experiments.

### Prompt Builder

The prompt builder combines:

- role instructions
- context
- task instructions

The generated prompt is saved with the run evidence.

### SimpleHarness

The current harness:

1. validates inputs
2. builds the prompt
3. calls the provider
4. runs evaluators
5. calculates overall pass/fail
6. returns a structured result

It is currently single-step.

### Harness Definition

A harness definition contains reusable execution or evaluation policy.

Examples:

```text
technical-coach
basic-reliability
```

A harness definition can be reused across multiple tasks and scenarios.

Harness-level evaluators should test general reliability properties.

Examples:

- nonempty output
- basic minimum length
- prohibited generic failure text

Harness-level evaluators should not contain requirements specific to one task.

### Scenario Definition

A scenario definition contains expectations for one specific task or evaluation case.

Example:

```text
explain-agentic-harness
```

Scenario-specific evaluators may check:

- required terminology
- required sections
- expected structure
- prohibited claims
- grounding in supplied context

### Scenario Dataset

A scenario dataset separates concrete model inputs from scenario evaluation
policy. Each validated case contains:

```ts
{
  id,
  scenarioId,
  task,
  context
}
```

The referenced scenario remains the source of evaluators and any structured
output contract. Roles, harnesses, and providers remain outside the dataset so
the same cases can compare different system configurations.

Datasets are nonempty and require unique case IDs. The dataset registry exposes
validated datasets by stable ID. Dataset resolution joins every case to the
scenario registry and rejects unknown policy references before execution.

The registered `agentic-harness-audiences` dataset currently exercises the
`explain-agentic-harness` policy with beginner and staff-engineer inputs.

The scenario-dataset runner resolves the entire dataset before execution,
expands a case-major execution plan, and passes resolved cases to an injected
executor with bounded concurrency. Each returned `HarnessResult` is wrapped
with its stable dataset case ID:

```ts
{
  datasetCaseId,
  harnessResult
}
```

This preserves dataset identity without changing the reusable individual-run
contract. Unknown scenario references prevent every case from executing.

Dataset execution uses the same runtime-validated execution policy as suite
execution. Repetition and concurrency must be positive integers and both
default to one. Work may complete out of order, but returned evidence remains
case-major, keeping observations for one input adjacent. A pure dataset
summarizer groups the preserved evidence by case ID and derives total, passed,
and failed counts plus a pass-rate ratio for each case.

### Scenario Suite Definition

A scenario suite definition groups registered scenario IDs for collective
execution.

Suite definitions are validated with Zod and require:

```ts
{
  id,
  description,
  scenarioIds
}
```

Suites must contain at least one scenario and may not contain duplicate scenario
IDs. Repeated execution remains separate from suite membership.

The suite registry resolves suites by ID. The suite resolver expands each
scenario ID through the scenario registry and rejects unknown references before
execution begins.

The scenario-suite runner resolves the complete suite before execution, builds
a scenario-major execution plan, then invokes an injected scenario executor
with bounded concurrency. This keeps suite ordering separate from harness and
provider behavior and prevents partial execution when reference resolution
fails. Each executor invocation returns a `HarnessResult`, and the runner
preserves those results in execution-plan order:

```ts
{
  suiteId,
  runs
}
```

The runner accepts the shared runtime-validated execution policy. Repetitions
and concurrency must be positive integers and default to one, preserving the
original single-run, sequential behavior for existing callers. Configured work
may finish out of order, but repeated results remain scenario-major and
adjacent in the returned evidence.

After execution, pure suite summarizers derive total, passed, and failed run
counts, a pass-rate ratio, and deterministic failure counts from the preserved
evidence. A pass rate is `null` when there are no runs, distinguishing absent
evidence from a measured zero-percent result.

Outcome metrics and diagnostics remain separate. Execution failures are counted
by provider-neutral category, while failed evaluations are counted by evaluator
ID. A run may contribute several failure reasons, so these diagnostic counts do
not need to equal the number of failed runs. The runner returns both summaries
alongside the unmodified run records.

The shared ordered-concurrency mapper uses a bounded worker pool and stores each
result at its original execution-plan index. Suite and dataset runners therefore
share scheduling behavior without coupling their evidence contracts.

### Reliability Comparison

Reliability comparison is a pure orchestration function over pass-rate
summaries. It preserves baseline and candidate rates, calculates candidate
minus baseline, and classifies the observed direction as improved, regressed,
unchanged, or insufficient evidence.

The comparison contract is structurally compatible with suite and dataset-case
summaries. A negative delta is an observed regression, not a claim of
statistical significance. Significance analysis and confidence intervals remain
future reliability-experiment concerns.

### Evaluator

An evaluator checks a property of the run.

Current evaluator input:

```ts
{
  role,
  task,
  context,
  prompt,
  output
}
```

Current evaluator result:

```ts
{
  evaluatorId,
  passed,
  message
}
```

### Deterministic Evaluator

A deterministic evaluator uses explicit code and rules.

Examples:

- output is not empty
- output has at least 100 characters
- output contains a required phrase
- output excludes a forbidden phrase

Deterministic evaluators are:

- cheap
- repeatable
- explainable
- easy to test

### Model-Based Evaluator

A model-based evaluator asks another model to judge a result.

This is not implemented yet.

Possible future uses:

- technical correctness
- completeness
- groundedness
- usefulness
- nuanced policy compliance

Model-based evaluators should not replace deterministic checks that code can perform reliably.

### Harness Result

Each run currently records:

```ts
{
  runId,
  harnessId,
  scenarioId,
  role,
  task,
  context,
  prompt,
  output,
  parsedOutput,
  refusal,
  executionFailure,
  evaluations,
  passed,
  durationMs,
  completedAt
}
```

`output` preserves the raw provider response. `parsedOutput` contains
schema-validated structured data when available, otherwise `null`. `refusal`
records an explicit provider refusal separately from parsing or evaluation
failure. `executionFailure` records provider transport, parsing, or unknown
failures and forces the overall run result to fail.

### Registry

Registries resolve reusable definitions by ID.

Current registries:

- harness registry
- scenario registry

Registries prevent selection logic from being spread throughout the application.

## Harness Versus Scenario

A harness answers:

> How should this class of agent execution be controlled and evaluated?

A scenario answers:

> What must be true for this specific task to be considered successful?

Example:

```text
Harness:
basic-reliability

General checks:
- output exists
- output is long enough

Scenario:
explain-agentic-harness

Specific checks:
- output contains "agentic harness"
- output explains model versus harness responsibilities
```

## Scenario Resolution

Scenario lookup is optional and keyed by task ID.

Harness evaluators always run. When a matching scenario exists, its evaluators
are appended after the harness evaluators. Tasks without scenarios continue with
general harness checks only.

The selected scenario ID, or explicit `null`, is recorded in each run result.

## Architectural Principles

### Local First

The repository and filesystem are the source of truth.

### Provider Neutral

Core code should not depend directly on one model vendor.

### Explicit Context

The system records exactly what context the model received.

### Deterministic Shell

Probabilistic model behavior is surrounded by deterministic code.

### Complete Evidence

Each run should be inspectable after completion.

### Read-Only Before Write Access

Future tools should begin with safe inspection capabilities before file modification or shell execution.

### One Orchestrator Before Multiple Agents

Multi-agent workflows should be introduced only when they solve a demonstrated problem.

### Tests Without Live API Calls

Most tests should use `FakeProvider`.

### Small Components

Providers, loaders, evaluators, registries, and persistence remain separate.
