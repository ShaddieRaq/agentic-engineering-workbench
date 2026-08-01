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

---

## Decision 024 — Classify Observed Pass-Rate Change Without Overclaiming

Status: Accepted

### Decision

Compare candidate pass rate against baseline pass rate with candidate minus
baseline as the delta. Classify the observed direction as improved, regressed,
unchanged, or insufficient evidence when either rate is absent.

### Rationale

The same deterministic comparison should work for suite summaries, dataset-case
summaries, and future replayed evidence. A directional rate change is useful for
regression gates, but small samples do not establish statistical significance.

### Consequences

- negative deltas consistently mean observed regression
- missing evidence cannot masquerade as improvement or regression
- comparison remains independent of model execution
- baseline and candidate rates remain inspectable with the delta
- confidence intervals and statistical significance remain future work

---

## Decision 025 — Bound Concurrency Without Reordering Evidence

Status: Accepted

### Decision

Use one runtime-validated execution policy for suite and dataset runners.
Repetition and concurrency are positive integers that default to one. Expand a
stable scenario-major or case-major execution plan before scheduling work, run
that plan through a bounded worker pool, and store results by plan index rather
than completion order.

This decision supersedes the sequential-only execution constraints recorded in
Decisions 016, 018, and 023 while preserving their default behavior.

### Rationale

Provider calls are independent and can benefit from parallel execution, but
completion order is nondeterministic. Evidence ordering must remain stable so
persisted runs, summaries, comparisons, and debugging do not change merely
because network timing changed.

### Consequences

- existing callers remain sequential by default
- invalid concurrency fails before execution begins
- suite and dataset runners share scheduling policy and implementation
- active work never exceeds the configured concurrency limit
- returned evidence follows execution-plan order rather than completion order
- runner-specific evidence wrappers remain independent of scheduling

---

## Decision 026 — Expose Dataset Execution Through a Separate CLI

Status: Accepted

### Decision

Add a dedicated dataset command that assembles a registered dataset, role,
harness definition, and provider through a reusable dataset executor adapter.
Persist the complete `ScenarioDatasetRunResult` as one aggregate artifact.

### Rationale

The existing CLI is optimized for one file-backed task and context selection.
Dataset execution has different inputs and produces case-linked aggregate
evidence. A separate entry point keeps both command contracts explicit while
reusing the same `SimpleHarness` execution path.

Persisting only individual `HarnessResult` objects would discard dataset case
identity and summaries. The aggregate result is the evidence boundary needed
for later replay and baseline-versus-candidate comparison.

### Consequences

- registered datasets can be run against the live OpenAI provider
- unit tests use `FakeProvider` through the same executor adapter
- repetition and concurrency remain runtime validated
- one artifact preserves case identity, run evidence, and summaries
- the original single-run CLI remains backward compatible

---

## Decision 027 — Compare One Controlled Configuration Variable at a Time

Status: Accepted

### Decision

Define a reliability experiment as one registered dataset, one harness, one
execution policy, and distinct baseline and candidate role configurations. Run
the baseline and candidate sequentially, preserve both complete dataset
results, and compare matching case pass rates.

### Rationale

A useful experiment needs stable inputs and evaluation policy. Changing roles,
harness evaluators, models, and execution settings simultaneously would make an
observed reliability difference difficult to attribute. Role instructions are
the first controlled variable because they already flow directly into every
prompt and require no provider-specific behavior.

### Consequences

- baseline and candidate use identical cases and quality contracts
- exact role instructions remain preserved inside run evidence
- comparisons are reported per stable dataset case ID
- the artifact distinguishes configuration from measured evidence
- model, context-strategy, token, and cost comparisons remain future
  experiment extensions

---

## Decision 028 — Keep Correctness and Latency as Separate Signals

Status: Accepted

### Decision

Summarize latency per dataset case with sample count, average, minimum, and
maximum duration. Compare candidate average duration against baseline average
duration, but store latency comparisons separately from reliability
comparisons.

### Rationale

A faster response can still be incorrect, and a more reliable response can be
slower. Combining these properties into one score would conceal the tradeoff
and make release decisions harder to audit. Preserving both source summaries
also allows later reporting to present the evidence without recalculation.

### Consequences

- negative latency deltas consistently mean the candidate was faster
- missing samples produce insufficient evidence rather than a zero duration
- experiment artifacts expose reliability and latency independently
- observed latency direction does not imply statistical significance
- token usage and cost remain separate future evidence signals

---

## Decision 029 — Preserve Usage Before Estimating Cost

Status: Accepted

### Decision

Store provider-neutral model and token-usage evidence in every successful
`HarnessResult`. Derive experiment cost from an explicit, dated pricing policy
instead of storing a provider-reported or silently hardcoded cost. Keep token,
cost, latency, and reliability comparisons as separate signals.

The initial pricing policy covers standard GPT-5.4 requests below 272,000 input
tokens using the rates observed on 2026-08-01 from the official OpenAI pricing
page. Unsupported models, long-context requests, failed calls, and missing
usage produce `null` cost evidence rather than a fabricated zero.

### Rationale

Token counts are durable execution evidence; prices are mutable business
policy. Separating them allows old runs to be repriced later and makes every
estimate auditable. Separate signals prevent a cheaper but less reliable
candidate from appearing unconditionally better.

### Consequences

- persisted runs expose model and token usage without OpenAI field names
- failed provider calls explicitly have no provider evidence
- cached input is priced separately from uncached input
- reasoning tokens remain visible and are already included in output-token cost
- experiment comparisons require complete, equally sized usage samples
- pricing identifiers, source URL, and observation date remain inspectable

---

## Decision 030 — Configure Models at the Experiment Variant Boundary

Status: Accepted

### Decision

Make model ID part of each baseline and candidate experiment variant and inject
it into a separately configured provider instance. Default both variants to
`gpt-5.4` for backward compatibility. Support independent model flags so a
model comparison can hold role, dataset, harness, and execution policy
constant.

### Rationale

A model is an experimental variable, not an implementation detail of
`OpenAIProvider`. Variant-level configuration makes the intended difference
explicit in the persisted experiment definition, while response evidence still
records the model that actually served each request.

### Consequences

- existing role comparisons retain GPT-5.4 defaults
- model comparisons can reuse the same experiment workflow
- baseline and candidate use separate provider instances
- experiments may change roles, models, or both, so callers remain responsible
  for changing only one variable when causal attribution matters
- GPT-5.4 and GPT-5.4 mini have dated standard-pricing policies
