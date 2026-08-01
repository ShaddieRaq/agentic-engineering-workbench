# Architecture Decisions

## Decision 001 — Use TypeScript

Status: Accepted

### Decision

Use TypeScript and Node.js as the primary implementation stack.

### Rationale

The user already has strong TypeScript and Node.js experience. TypeScript provides useful contracts for providers, evaluators, harness results, and scenarios.

### Consequences

- strong compile-time support
- easy integration with AI SDKs
- familiar testing ecosystem
- runtime validation is still required

---

## Decision 002 — Use Zod for Runtime Validation

Status: Accepted

### Decision

Use Zod schemas for roles, tasks, and context.

### Rationale

TypeScript types do not exist at runtime. External files and model outputs require runtime validation.

### Consequences

- invalid input fails early
- types can be inferred from schemas
- future structured model output can use the same approach

---

## Decision 003 — Hide Model Access Behind `AIProvider`

Status: Accepted

### Decision

Core harness code depends on `AIProvider`, not directly on the OpenAI SDK.

### Rationale

This supports isolated testing and future provider replacement.

### Consequences

- `FakeProvider` can be used in tests
- provider-specific behavior stays isolated
- other providers can be added later

---

## Decision 004 — Use a Fake Provider for Most Tests

Status: Accepted

### Decision

Unit tests should avoid live model calls.

### Rationale

Live model tests are slower, cost money, and may be nondeterministic.

### Consequences

- most tests are fast and repeatable
- live integration checks remain separate
- model behavior still requires scenario evaluation

---

## Decision 005 — Keep Roles, Tasks, and Context Explicit

Status: Accepted

### Decision

Roles and tasks are loaded from Markdown. Context is loaded from explicit file paths.

### Rationale

The user should be able to inspect exactly what entered the model request.

### Consequences

- prompts are easier to review
- context experiments are possible
- run evidence remains understandable

---

## Decision 006 — Persist Complete Run Evidence

Status: Accepted

### Decision

Save each run to a JSON file.

### Rationale

Agent debugging requires knowing:

- what instructions were used
- what context was supplied
- what output was generated
- which checks passed or failed

### Consequences

- runs can later support replay
- the `runs/` directory must remain gitignored
- sensitive context must not be used casually

---

## Decision 007 — Inject Evaluators Into the Harness

Status: Accepted

### Decision

Evaluators are passed into `SimpleHarness`.

### Rationale

The harness should not hardcode one fixed evaluation policy.

### Consequences

- different harness definitions can use different checks
- evaluators can be tested independently
- evaluation composition is explicit

---

## Decision 008 — Separate Harness Policy From Scenario Expectations

Status: Accepted

### Decision

General checks belong to harness definitions.

Task-specific expectations belong to scenario definitions.

### Example

Harness-level:

```text
output must not be empty
```

Scenario-level:

```text
explanation must include "agentic harness"
```

### Consequences

- harnesses remain reusable
- scenarios express specific success criteria
- scenario lookup is optional and keyed by task ID
- harness evaluators always run
- matching scenario evaluators are appended after harness evaluators
- tasks without scenarios continue with general harness checks
- run evidence records the scenario ID or explicit `null`

---

## Decision 009 — Start With Deterministic Evaluators

Status: Accepted

### Decision

Implement explicit code-based evaluators before model-based evaluators.

### Rationale

Deterministic checks are:

- repeatable
- explainable
- inexpensive
- easy to test

### Consequences

- early evaluators are simple
- nuanced quality checks will require additional strategies later
- model-based evaluation remains a later phase

---

## Decision 010 — Start With One Orchestrator

Status: Accepted

### Decision

Do not begin with several autonomous agents.

### Rationale

A single orchestrator is easier to understand, debug, secure, and evaluate.

### Consequences

- multi-agent behavior will be added only when justified
- reviewer or adversarial roles may be introduced as controlled workflow steps

---

## Decision 011 — CLI Before Web UI

Status: Accepted

### Decision

Use a command-line interface for the initial platform.

### Rationale

The project is focused on architecture and reliability, not front-end presentation.

### Consequences

- faster iteration
- easier automation
- no current multi-user or hosted interface

---

## Decision 012 — Keep the Project Local First

Status: Accepted

### Decision

The local repository is the source of truth.

### Rationale

The user wants to learn agent engineering without depending on ChatGPT web as the runtime.

### Consequences

- OpenAI is accessed through an API key
- files, tests, runs, and architecture remain locally controlled
- external platforms may be optional integrations later

---

## Decision 013 — Structured Output Contracts Belong to Scenarios

Status: Accepted

### Decision

Define task-specific structured output schemas in the scenario layer.

Scenario definitions may expose an optional Zod schema. Providers and harnesses consume that contract without embedding task-specific response shapes.

Structured runs preserve the raw model response alongside parsed output and explicit refusal evidence.

### Rationale

Different scenarios require different response structures. Keeping schemas with scenarios preserves separation between reusable execution policy and task-specific success criteria.

Raw output remains necessary for debugging schema failures, replaying validation, and preserving complete run evidence.

### Consequences

- scenarios can adopt structured output incrementally
- the scenario registry exposes schemas through the general `ZodType` boundary
- individual schema modules retain precise inferred TypeScript types
- providers remain unaware of specific scenario fields
- parsing must not overwrite or discard raw model output

---

## Decision 014 — Normalize Provider Failures Into Run Evidence

Status: Accepted

### Decision

Provider adapters translate known SDK failures into provider-neutral categories.
The harness records transport, parsing, and unknown provider failures in
`HarnessResult` and marks the run as failed.

### Rationale

Provider exceptions should not terminate execution without leaving inspectable
evidence. The harness should not depend on vendor-specific exception classes.

### Consequences

- OpenAI connection failures are classified as `transport`
- JSON and Zod failures are classified as `parsing`
- unrecognized provider exceptions are classified as `unknown`
- provider failures produce an empty raw output when no response is available
- execution failure forces overall run failure even when no evaluators exist

---

## Decision 015 — Suites Reference Registered Scenario IDs

Status: Accepted

### Decision

Scenario suites contain unique scenario IDs rather than embedded scenario
definitions. Suite definitions are validated with Zod, resolved through the
scenario registry, and rejected before execution when a reference is unknown.

### Rationale

Scenario definitions remain the source of truth for evaluators and output
schemas. Suite membership should not duplicate that policy or use repeated IDs
to imply execution count.

### Consequences

- suite definitions remain small and serializable
- scenario policy changes are automatically visible to suites
- unknown scenario references fail before suite execution
- repeated execution is modeled separately from suite membership

---

## Decision 016 — Inject Scenario Execution Into the Suite Runner

Status: Accepted

### Decision

The scenario-suite runner resolves all scenario references before execution and
invokes an injected scenario executor sequentially.

### Rationale

Suite orchestration should control membership and ordering without embedding
role loading, task loading, provider construction, or harness execution.
Preflight resolution prevents partial execution when suite references are
invalid.

### Consequences

- suite execution remains testable without live providers
- scenario execution policy can evolve independently
- current execution order is explicit and sequential
- invalid references cause zero scenario executions
- result collection, repetition, and concurrency remain separate additions

---

## Decision 017 — Preserve Ordered Suite Run Evidence

Status: Accepted

### Decision

Each scenario executor returns a `HarnessResult`. The scenario-suite runner
collects those results in execution order and returns them with the suite ID.

### Rationale

Suite execution must retain the same evidence used for individual-run
debugging and evaluation. Returning raw run records keeps orchestration
observable without prematurely combining evidence into summary metrics.

### Consequences

- callers receive every scenario's complete run evidence
- result order matches the suite's sequential execution order
- aggregation can be added without changing the underlying evidence
- repetition, pass-rate calculation, and concurrency remain separate concerns

---

## Decision 018 — Model Repetition as Validated Execution Policy

Status: Accepted

### Decision

Scenario-suite execution accepts a repetition count that defaults to one and
must be a positive integer. The runner executes repetitions sequentially in
scenario-major order and preserves every resulting `HarnessResult`.

### Rationale

Repeated observations measure nondeterministic reliability; they are not
duplicate suite membership. Runtime validation prevents empty, negative, or
fractional execution plans from producing misleading evidence.

### Consequences

- suite definitions continue to contain unique scenario IDs
- existing callers retain single-run behavior by default
- repeated evidence for each scenario stays adjacent
- invalid repetition policies fail before scenario execution
- aggregation and concurrency remain independent additions

---

## Decision 019 — Derive Suite Metrics From Preserved Evidence

Status: Accepted

### Decision

Calculate suite-level total, passed, and failed counts and a pass-rate ratio in
a pure summarizer. Return the summary alongside the original ordered run
records. Represent pass rate as `null` when no runs exist.

### Rationale

Metrics should be reproducible from live or persisted evidence without
rerunning a model. Keeping calculation separate from orchestration avoids
mixing execution control with reporting logic. Explicit no-evidence semantics
prevent an empty dataset from appearing equivalent to a measured zero-percent
pass rate.

### Consequences

- suite metrics can be recalculated during replay or reporting
- raw run evidence remains available for audit and debugging
- pass rate is stored as a ratio from zero to one
- presentation layers may format the ratio as a percentage
- failure-category summaries remain a separate extension

---

## Decision 020 — Separate Failure Outcomes From Failure Reasons

Status: Accepted

### Decision

Return suite outcome metrics and diagnostic failure summaries as separate
fields. Count execution failures by provider-neutral category and failed
evaluations by evaluator ID.

### Rationale

A failed run answers whether an observation met its contract. Failure-reason
counts answer why it failed. One run can contain a provider failure and several
failed evaluations, so combining these measurements would create misleading
totals.

### Consequences

- provider and quality failures remain distinguishable
- repeated evaluator failures reveal recurring contract violations
- diagnostic counts may exceed the number of failed runs
- original messages and run evidence remain available for investigation
- summary calculation remains deterministic and replayable

---

## Decision 021 — Separate Dataset Inputs From Scenario Policy

Status: Accepted

### Decision

Model evaluation inputs as validated scenario dataset cases containing a stable
case ID, scenario-policy reference, task, and explicit context. Keep roles,
harnesses, providers, evaluators, and output schemas outside dataset cases.

### Rationale

One logical quality contract should be reusable across many input variations.
Copying evaluators or schemas into each case would create policy drift and make
comparisons unreliable. Keeping system configuration outside the dataset also
allows the same evidence set to compare prompts and providers later.

### Consequences

- datasets remain serializable and provider-neutral
- scenario definitions remain the source of evaluation policy
- case IDs can anchor replay and comparison evidence
- empty datasets and duplicate case IDs are rejected
- unknown scenario references fail during resolution
- dataset execution must preserve case identity separately from run identity

---

## Decision 022 — Preserve Dataset Case Identity Outside Harness Results

Status: Accepted

### Decision

Execute resolved dataset cases through an injected executor and wrap each
returned `HarnessResult` with its dataset case ID. Resolve the complete dataset
before any executor invocation.

### Rationale

`HarnessResult` describes one reusable model run and should not depend on every
orchestration layer that may consume it. Dataset identity is still required for
case-level comparison and replay, so it belongs in dataset-run evidence rather
than inside the harness contract.

### Consequences

- individual harness results remain reusable outside datasets
- every dataset run can be traced to its source case
- dataset policy references fail before partial execution
- execution remains testable without live providers
- repetition and per-case aggregation remain separate extensions

---

## Decision 023 — Share Repetition Policy and Derive Per-Case Metrics

Status: Accepted

### Decision

Use one runtime-validated repetition policy for suite and dataset runners.
Execute dataset repetitions sequentially in case-major order and derive
per-case reliability metrics from the preserved case-linked run evidence.

### Rationale

Repetition is workflow-control policy, not a property of one orchestrator.
Centralizing it prevents suite and dataset execution from accepting different
configurations. Dataset-wide metrics can hide weak inputs, so reliability must
also be visible for each stable case ID.

### Consequences

- zero, negative, and fractional repetition counts fail consistently
- existing callers retain a default of one execution
- repeated case evidence stays adjacent and inspectable
- weak cases remain visible even when aggregate results look healthy
- individual `HarnessResult` records remain unchanged
