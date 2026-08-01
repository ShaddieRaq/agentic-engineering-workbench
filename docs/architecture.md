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

The scenario-suite runner resolves the complete suite before execution, then
awaits an injected scenario executor once for each scenario. This keeps suite
ordering separate from harness and provider behavior and prevents partial
execution when reference resolution fails. Each executor invocation returns a
`HarnessResult`, and the runner preserves those results in suite order:

```ts
{
  suiteId,
  runs
}
```

The runner accepts a runtime-validated repetition count. Repetitions must be a
positive integer and default to one, preserving the original single-run
behavior. Execution remains sequential and scenario-major, so repeated results
for the same scenario remain adjacent in the returned evidence.

After execution, pure suite summarizers derive total, passed, and failed run
counts, a pass-rate ratio, and deterministic failure counts from the preserved
evidence. A pass rate is `null` when there are no runs, distinguishing absent
evidence from a measured zero-percent result.

Outcome metrics and diagnostics remain separate. Execution failures are counted
by provider-neutral category, while failed evaluations are counted by evaluator
ID. A run may contribute several failure reasons, so these diagnostic counts do
not need to equal the number of failed runs. The runner returns both summaries
alongside the unmodified run records.

The runner does not yet schedule concurrent work.

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
