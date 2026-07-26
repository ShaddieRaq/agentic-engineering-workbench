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
helper. `FakeProvider` returns deterministic provider results for offline tests.

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
  evaluations,
  passed,
  durationMs,
  completedAt
}
```

`output` preserves the raw provider response. `parsedOutput` contains
schema-validated structured data when available, otherwise `null`. `refusal`
records an explicit provider refusal separately from parsing or evaluation
failure.

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
