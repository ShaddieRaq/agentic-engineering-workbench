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

---

## Decision 031 — Report Reliability Uncertainty Without Significance Claims

Status: Accepted

### Decision

Calculate a Wilson 95% confidence interval from each case's passed and total
run counts. Persist baseline and candidate intervals and classify only their
geometric relationship: overlapping, candidate above, baseline above, or
insufficient evidence.

### Rationale

Raw pass rates conceal sample size. Five passes out of five and five hundred
passes out of five hundred both display as 100%, but they carry very different
uncertainty. Wilson intervals behave sensibly for small samples and boundary
rates without requiring a statistical dependency. Non-overlapping intervals
are useful evidence, but the workbench should not mislabel them as a formal
hypothesis test.

### Consequences

- experiment artifacts expose sample uncertainty per dataset case
- empty samples produce explicit insufficient evidence
- small perfect samples retain appropriately wide intervals
- pass-rate direction and confidence-interval relationship remain separate
- formal significance tests and experiment power analysis remain future work

---

## Decision 032 — Validate Tool Boundaries Before Model Tool Selection

Status: Accepted

### Decision

Represent tools as typed definitions with Zod input/output contracts and run
them through one deterministic executor that records structured evidence.
Begin with an immediate-directory `list-files` capability whose allowed root is
chosen by the application, not the model. Enforce lexical and real-path
containment, denied path segments, and output limits before connecting any tool
to provider tool calling.

### Rationale

Model tool selection adds probabilistic control flow. Permission enforcement
must already be correct and independently testable before that layer exists.
Separating the capability from its controller allows every later tool to share
validation, failure classification, timing, and evidence behavior.

### Consequences

- invalid inputs, permission denials, and execution failures remain distinct
- normalized executed input is preserved in evidence
- invalid tool output is classified as an execution defect
- direct traversal and symbolic-link escape are denied
- sensitive and high-volume repository paths are hidden by default
- the model currently cannot select or invoke tools

---

## Decision 033 — Centralize Repository Path Policy and Reject Partial Reads

Status: Accepted

### Decision

Use one repository-path resolver for all filesystem tools. It canonicalizes the
application-selected root, performs lexical containment and deny-list checks,
resolves the requested real path, and checks containment again. Implement
`read-file` as a complete UTF-8 read bounded by the lower of request and
application byte limits. Reject oversized or binary content instead of
returning a partial file.

### Rationale

Duplicated path checks can drift and create inconsistent permissions. A shared
resolver makes traversal and symbolic-link policy uniform. Silent truncation is
reasonable for a directory listing but dangerous for source content: omitted
code can change the meaning of a file and lead an agent to unsupported
conclusions.

### Consequences

- filesystem tools share the same containment and deny-list behavior
- the application limit always overrides a larger requested limit
- file size is checked before content is loaded
- invalid UTF-8 and null-byte content are denied
- callers receive explicit failure evidence when a complete safe read is not
  possible

---

## Decision 034 — Search Literal Text In-Process With Layered Limits

Status: Accepted

### Decision

Implement repository search in TypeScript using literal, single-line matching.
Traverse entries in sorted order without following symbolic links. Apply
independent policy limits for files inspected, individual file bytes, matches,
aggregate output bytes, preview length, and elapsed time. Classify deadline
failures separately as `timeout` evidence.

### Rationale

Shelling out would introduce platform dependency and create an unnecessary
command-injection boundary. User-provided regular expressions can also consume
unbounded CPU. Literal in-process matching is sufficient for repository context
discovery and keeps behavior explicit. Layered limits prevent any one control
from becoming the sole defense against excessive context or runtime.

### Consequences

- queries cannot execute shell syntax
- search behavior is deterministic and case sensitivity is explicit
- binary, oversized, denied, and symlinked files are skipped
- matches cite repository path, line, column, and bounded preview
- match-limit exhaustion returns partial evidence marked `truncated`
- deadline exhaustion returns a classified failure without partial output

---

## Decision 035 — Compose Semantic Inspection Tools From Safe Capabilities

Status: Accepted

### Decision

Implement `inspect-package` by composing the existing bounded `read-file`
capability. Restrict targets to files named `package.json`, validate the parsed
manifest, and return only project identity, module type, scripts, and dependency
maps in stable key order.

### Rationale

A semantic tool should not duplicate filesystem authorization or expose every
field merely because the source document contains it. Reusing the safe reader
keeps traversal, symbolic-link, denied-path, binary, and byte-limit behavior
consistent. Selecting the output fields minimizes context and makes the tool's
information boundary explicit.

### Consequences

- package inspection inherits the shared repository permission policy
- malformed JSON is recorded as an execution failure
- schema-invalid package metadata is rejected before it becomes evidence
- arbitrary manifest fields are omitted
- the tool records one semantic `inspect-package` call rather than leaking an
  internal nested read operation

---

## Decision 036 — Inspect Git Changes Through Fixed Read-Only Invocations

Status: Accepted

### Decision

Implement `inspect-git-diff` with application-owned `git diff` and `git
ls-files` argument lists. Allow the caller to select only working-tree versus
staged mode, context-line count, and a requested byte limit. Disable external
diff drivers, text conversion, and color output. Report untracked paths for
working-tree inspection without reading their contents.

### Rationale

Change review needs evidence that includes tracked patches and awareness of
untracked files. Exposing a shell command or arbitrary Git arguments would turn
a read-only inspection capability into an uncontrolled execution boundary.
Returning only the tracked diff would also create false confidence when new
files are part of the change.

### Consequences

- tool callers cannot choose Git subcommands or arbitrary flags
- working-tree evidence distinguishes tracked diff content from untracked paths
- staged inspection excludes untracked files by definition
- output size and execution time are bounded by application policy
- external diff and text-conversion hooks cannot execute
- untracked file contents require a separate permitted read operation

---

## Decision 037 — Establish Explicit Workflows Before Model-Directed Tools

Status: Accepted

### Decision

Begin the local engineering assistant with an application-owned repository
inspection sequence: inspect package metadata, list the repository root, then
inspect working-tree changes. Preserve each complete tool-call record inside a
workflow result with its own identity, timing, completion time, and status.
Continue independent read-only inspections after a step failure while marking
the workflow unsuccessful.

### Rationale

Tool calling and multi-step execution are separate control problems. A fixed
workflow makes ordering, failure policy, and evidence propagation testable
before a probabilistic model is permitted to choose actions. Independent
inspection failures should not discard other context that may explain the
failure or still support diagnosis.

### Consequences

- workflow control remains deterministic and application-owned
- every step retains validation, permission, timeout, and execution evidence
- one failed step does not erase other independent inspection results
- overall success requires every configured step to succeed
- model-directed tool choice remains a later, separately tested boundary

---

## Decision 038 — Select Context Only From Observed Repository Evidence

Status: Accepted

### Decision

Derive repository-orientation context candidates from the successful root
listing using a deterministic allowlisted policy. Include only observed files,
order them by stable priority, record a rationale for each, and link the
selection to its source tool-call ID. Mark selection incomplete when listing
evidence failed or was truncated.

### Rationale

Context selection is an engineering policy, not synonymous with reading every
available file. Requiring an observed source prevents fabricated paths, while
priorities and rationales make inclusion decisions inspectable. Separating
selection from content loading allows a later aggregate token or byte budget to
reject candidates without losing the original reasoning.

### Consequences

- the workflow cannot select files absent from its repository evidence
- selection behavior is deterministic and independently testable
- incomplete discovery remains visible instead of appearing comprehensive
- file contents remain outside the workflow until a separate permitted read
- later model prompts can cite why each context item was included

---

## Decision 039 — Assemble Context Under an Aggregate Budget Without Duplication

Status: Accepted

### Decision

Read selected repository candidates in priority order through `read-file` with
a per-file limit and one aggregate byte limit. Preserve every read call, accepted
item, and rejected candidate. Store file content only in read tool-call evidence;
accepted context items reference that evidence by tool-call ID.

### Rationale

Individually safe reads can still create an unbounded combined prompt. An
aggregate budget makes total context growth explicit. Rejections must remain
visible so omitted context cannot be mistaken for absence. Duplicating content
inside both read evidence and assembled items increases persisted evidence and
model context without adding information.

### Consequences

- higher-priority candidates consume the context budget first
- budget exhaustion and read failure remain distinct outcomes
- a failed read does not prevent later smaller candidates from being attempted
- accepted items are traceable to the exact tool call containing their content
- persisted workflow evidence contains one copy of each loaded file

---

## Decision 040 — Validate the Model Handoff as a Separate Workflow Boundary

Status: Accepted

### Decision

Build a provider-neutral repository-analysis request from assembled context in
a pure function. Resolve every accepted context item to matching successful
read evidence before creating the prompt. Use a strict structured output schema
whose architecture, entry-point, risk, and test claims require evidence-path
citations. Do not execute a provider inside request construction.

### Rationale

Inspection, context selection, prompt construction, and model execution are
different failure boundaries. Separating request construction makes the exact
model input inspectable and testable without API calls. Tool-call linkage
validation prevents stale or mismatched content from entering the prompt under
an incorrect source label.

### Consequences

- request tests remain deterministic and provider-neutral
- broken context references fail before consuming model tokens
- prompts disclose incomplete context and rejected candidates
- structured analysis claims carry source-path fields
- citation correctness remains a separate evaluation concern
- provider execution and its evidence are added by a later workflow step

---

## Decision 041 — Preserve Provider Outcomes Inside the Analysis Run

Status: Accepted

### Decision

Execute repository-analysis requests through an injected `AIProvider` and
return one analysis result containing the complete inspection workflow,
serializable request evidence, raw and parsed output, refusal, provider usage,
classified execution failure, timing, and status. Catch provider failures
inside the runner rather than rejecting the run.

### Rationale

A provider failure is evidence about an attempted workflow, not a reason to
discard the inspection and prompt that led to it. Refusals and transport errors
also require different operator responses, so they must not collapse into one
generic failure state. Provider injection keeps unit tests deterministic and
the runner provider-neutral.

### Consequences

- every model attempt remains traceable to its exact inspection and prompt
- provider refusals remain distinct from execution failures
- known transport and parsing failures preserve their neutral category
- unsuccessful runs remain serializable and debuggable
- live provider construction and artifact persistence remain composition-root
  responsibilities

---

## Decision 042 — Persist Full Analysis Evidence and Print a Concise Summary

Status: Accepted

### Decision

Add an `analyze-repository` composition root that assembles controlled tools,
inspection, context, an `OpenAIProvider`, analysis execution, and artifact
persistence. Default live analysis to `gpt-5.4-mini`, allow explicit model and
instruction overrides, persist the complete result under ignored `runs/`, and
print only a concise terminal summary.

### Rationale

Operators need quick status without flooding the terminal with source files and
prompts, while debugging and evaluation require the complete evidence chain.
Keeping those presentation needs separate avoids either losing evidence or
making routine commands unusable. A lower-cost default is appropriate for
iterative repository inspection and remains overridable for higher-capability
analysis.

### Consequences

- live analysis uses the same tested provider-neutral runner
- complete prompts and context remain available in persisted artifacts
- terminal output reports status, model, context usage, path, and finding counts
- `.env` and `runs/` remain excluded from version control
- choosing another model or task does not change workflow implementation

---

## Decision 043 — Treat Unsupported Citations as Analysis Failure

Status: Accepted

### Decision

After structured repository analysis, deterministically collect all evidence
paths and compare them exactly against sources accepted into context. Preserve
available, cited, and invalid paths in an evaluation result. Require the
citation evaluation to pass before the analysis run is successful.

### Rationale

A schema can require citation fields but cannot prove that cited files were
actually available to the model. Allowing invented or unloaded paths would make
the output look grounded while defeating the evidence boundary. Exact path
matching is transparent and avoids silently treating aliases as equivalent.

### Consequences

- structurally valid output can still fail grounding evaluation
- unavailable citations remain visible for debugging and prompt improvement
- provider success, refusal, execution failure, and evaluation failure remain
  distinct states
- the CLI reports failed citation evaluation separately
- semantic support within a correctly cited file remains a future evaluator

---

## Decision 044 — Select Changed Files From Structured Git Evidence

Status: Accepted

### Decision

Expose tracked and untracked working-tree paths as structured output from the
bounded Git inspection tool. Keep repository instructions first, then
prioritize changed paths before remaining orientation context. Resolve duplicate
paths deterministically and read every selected path through the existing
permission and byte-budget boundary.

### Rationale

Patch text is presentation evidence, not a stable path-selection API. Parsing
it inside the context selector would couple workflow policy to Git patch syntax
and make quoted or renamed paths fragile. Explicit path evidence keeps the
selector pure while the controlled tool remains responsible for Git behavior.

### Consequences

- diff-review analysis can cite modified implementation and test files
- repository instructions remain the highest-priority context
- tracked deletions are excluded from read candidates
- denied and unreadable changed files cannot bypass `read-file` policy
- duplicate change and orientation paths are loaded only once
- failed Git inspection marks context selection incomplete

---

## Decision 045 — Version Workflow State Without Duplicating Snapshots

Status: Accepted

### Decision

Run multi-step workflows through a generic state schema, unique ordered steps,
an explicit maximum-step policy, and optional continue-on-failure behavior.
Validate initial and transitioned state at runtime. Preserve final state once
and record state-version transitions, step evidence, timing, stop reasons, and
classified failures in the trace.

### Rationale

Agent workflows need inspectable control flow, but embedding complete state
before and after every step would multiply repository context and model output
inside persisted artifacts. Version references retain transition order while
step-owned evidence and final state preserve the information needed for audit.

### Consequences

- invalid state transitions fail without replacing the last valid state
- step exceptions become workflow evidence rather than rejected promises
- explicit stop conditions remain distinct from failures and step limits
- independent later steps may run after failure only when policy allows it
- workflow success and domain verification remain separate signals
- the repository assistant reuses existing inspection and analysis boundaries

---

## Decision 046 — Model Adversarial Attacks as Dataset Evidence

Status: Accepted

### Decision

Represent adversarial attacks as optional validated metadata on scenario
dataset cases. Preserve attack ID, category, and expected defenses beside every
case-linked run. Keep the defense policy in one registered scenario with a
strict structured decision contract and deterministic leakage check.

### Rationale

Malicious text must remain data, not workflow control. Dataset identity makes
attacks repeatable and comparable, while one scenario prevents each fixture
from copying or drifting its defense criteria. Exact metadata also supports
later reporting without parsing prompts or context content.

### Consequences

- adversarial cases use the same bounded repetition and concurrency runner
- attack/defense role comparisons reuse the existing experiment system
- protected fixture leakage is checked without another model call
- scenario output cannot claim that untrusted instructions were followed
- tool permissions remain enforced by code rather than model compliance
- broader attack taxonomies can be added without changing `HarnessResult`
