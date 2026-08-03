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

---

## Decision 047 — Keep Model Judgment Beside Deterministic Evaluation

Status: Accepted

### Decision

Run model-based evaluation asynchronously over a completed `HarnessResult`
through an injected provider. Version the judge prompt, require structured
criterion evidence, and preserve raw output, parsed verdict, refusal, provider
failure, usage, cost, latency, and deterministic disagreement. Do not modify
the original deterministic evaluations or pass result.

### Rationale

Nuanced quality judgments are nondeterministic and can fail independently of
the subject run. Folding them into the synchronous evaluator interface would
turn every harness unit test into an API workflow and conceal whether a failure
came from subject execution or judging. Parallel evidence keeps both signals
auditable.

### Consequences

- deterministic checks remain cheap and authoritative for explicit contracts
- judge prompts and models can be compared as versioned configurations
- uncertain verdicts do not imply agreement or disagreement
- judge cost and latency remain visible as separate operational signals
- provider failures preserve the subject run and its original outcome
- reporting may expose disagreement without collapsing it into one score

---

## Decision 048 — Validate Report Sources and Preserve Replay Lineage

Status: Accepted

### Decision

Load report inputs through a root-bounded, size-bounded, strict current
`HarnessResult` contract. During batch discovery, preserve accepted paths and
rejected artifact reasons instead of failing the entire report or silently
coercing historical shapes. Replay a validated source run from its saved role,
task, context, harness, and scenario, then persist the source, new run, and
comparison together.

### Rationale

The local `runs/` directory can contain individual runs, aggregate artifacts,
and historical schemas. Filename conventions alone are insufficient evidence
that a file belongs in current reliability metrics. Replay also needs explicit
lineage so a new probabilistic result cannot be confused with or overwrite the
original observation.

### Consequences

- aggregate metrics include only current runtime-validated harness runs
- incompatible evidence remains visible as rejected source metadata
- historical artifacts do not prevent reports over current evidence
- replay requires a registered harness and any recorded scenario policy
- model changes are explicit while saved input remains fixed
- reports and replays create new immutable evidence artifacts

---

## Decision 049 — Separate Agent Manifests From Typed Registrations

Status: Accepted

### Decision

Represent each agent with a strict serializable manifest and a typed runtime
registration. The manifest owns identity, semantic version, lifecycle,
ownership, component references, tool permissions, defaults, and verification
policy. The registration owns schemas, execution, and domain assessment. Store
registrations in an immutable statically imported catalog.

### Rationale

Existing components did not identify which combinations form one maintained
agent product. Serializable manifests make the catalog inspectable, while typed
registrations support custom workflows without pretending functions are
configuration. Static imports keep loading explicit at the current local scale.

### Consequences

- agents have one discoverable product identity and version
- manifests can be listed and validated without provider credentials
- duplicate IDs and unresolved references fail before execution
- custom agent code remains type checked and runtime validated
- the contract supports later extraction into npm packages

---

## Decision 050 — Supply Agent Capabilities Through One Shared Runner

Status: Accepted

### Decision

Execute every agent through a provider-neutral runner. The platform supplies
the workspace, provider, and only manifest-allowed tools. Validate JSON and
agent-specific input and output, then assess domain success separately from
runtime validity. Preserve manifest lineage, configuration, warnings, output,
assessment, failure, and timing in one run envelope.

### Rationale

Schema-valid output may still represent an unsuccessful workflow. Tool names
are not permissions unless runtime services actually filter the catalog. A
shared runner prevents agents from inventing inconsistent validation, failure,
permission, and evidence behavior.

### Consequences

- runtime success and agent-goal success remain distinguishable
- undeclared tools are absent from agent execution services
- retired agents cannot run and deprecated runs retain warnings
- non-JSON inputs and outputs cannot enter persisted evidence
- every run carries reproducible definition lineage

---

## Decision 051 — Verify Complete Agents With Versioned Agent Datasets

Status: Accepted

### Decision

Define agent datasets as stable JSON inputs referencing one agent. Execute
cases through the shared runner with existing repetition and concurrency
policy. Preserve case identity and complete agent-run evidence, calculate
per-case pass rates, apply the manifest threshold, and reject evidence from
another agent version.

### Rationale

Scenario datasets test task policy, but workflow agents also contain tools,
context selection, orchestration, and domain verification. The catalog needs
evidence about the complete product. Version matching prevents old evidence
from silently approving changed behavior.

### Consequences

- agents own repeatable product-level regression cases
- gates measure assessed outcomes rather than execution alone
- concurrent completion cannot reorder case evidence
- live verification cost remains explicit through repetitions
- datasets should expand from observed failures

---

## Decision 052 — Prove the Platform With Two Agents Before Externalizing It

Status: Accepted

### Decision

Keep agent packages under `src/agents` and prove the model with the Repository
Assistant and Change Risk Reviewer. Do not add dynamic discovery, a database,
a web control plane, or separate packages until ownership, deployment, or
permission needs demonstrate that boundary.

### Rationale

One migrated agent could hide an abstraction designed around itself. A second
agent with a distinct contract and dataset demonstrates reuse. Premature
packaging adds release complexity without improving the local workflow.

### Consequences

- the repository can support many isolated agent folders
- shared platform capabilities remain local and reusable
- the catalog is the connection point rather than directory scanning
- package extraction remains possible through registration exports
- scaling decisions follow concrete organizational or security pressure

---

## Decision 053 — Add a Local Visual Control Plane

Status: Accepted

### Decision

Add a React console served by a loopback Fastify process. Use it to discover,
run, verify, and inspect registered agents while keeping the CLI as a supported
adapter over the same application services.

### Rationale

The platform has enough agent, workflow, permission, dataset, and evidence
structure that a visual representation materially improves understanding and
daily use. Reimplementing behavior in the UI would create a second runtime.

### Consequences

- browser and CLI results use the same registered agent runner
- the console can remain read-only when no API key is configured
- remote hosting and authentication remain outside the current boundary
- the browser improves visibility without becoming the source of agent code

---

## Decision 054 — Persist Agent Evidence Through a Runtime-Validated Store

Status: Accepted

### Decision

Place `FileArtifactStore` behind an `ArtifactStore` interface. Validate current
agent artifacts on both write and read, bound file size and identifiers, and
surface incompatible evidence as explicit rejections.

### Rationale

The filesystem already provides transparent, portable evidence. A store
interface removes persistence details from application services and preserves
a future database boundary without adding one prematurely.

### Consequences

- historical files cannot silently enter current console views
- listing and filtering do not require parsing UI-specific conventions
- immutable JSON remains easy to debug and version externally
- database migration is possible when operational evidence warrants it

---

## Decision 055 — Model Interactive Work as Background Operations

Status: Accepted

### Decision

Accept live runs and verification as in-memory operations with queued, running,
completed, and failed states plus ordered lifecycle events. Expose snapshots by
polling and events by server-sent streams.

### Rationale

Provider and dataset execution outlive an ordinary HTTP request from the
operator's perspective. Explicit operations make orchestration and progress
visible without introducing a queue, worker service, or database.

### Consequences

- terminal execution evidence is persisted separately from ephemeral progress
- process restarts discard operation status but not completed run artifacts
- cancellation is deferred until provider and workflow abort semantics exist
- a durable queue remains a future deployment concern

---

## Decision 056 — Keep the Web Console Loopback-Only

Status: Accepted

### Decision

Bind the server to `127.0.0.1`, reject non-loopback hostnames and origins,
constrain request bodies, apply browser security headers, and expose only fixed
registered operations.

### Rationale

The console can initiate paid model calls and expose repository evidence. It is
designed for one local operator, so remote access would require authentication,
authorization, secret handling, and a broader threat model.

### Consequences

- the current server must not be treated as a remotely deployable product
- arbitrary shell commands and executable browser-authored code are excluded
- local catalog inspection remains available without model credentials
- future hosting requires a new explicit security decision

---

## Decision 057 — Keep Agent Authoring Code-First With a Safe Scaffold

Status: Accepted

### Decision

Generate a typed experimental agent package from the CLI, refuse overwrites,
and require explicit source registration. Use the console to explain agent
anatomy but not to save or execute arbitrary new agent implementations.

### Rationale

Agent behavior includes contracts, permissions, orchestration, and assessment;
it deserves type checking, tests, review, and source control. A scaffold removes
boilerplate while retaining those engineering controls.

### Consequences

- new agents begin with a manifest, schemas, dataset, and test
- registration changes stay visible in code review
- the console can later offer configuration editors only for safely bounded data
- separately packaged agents remain compatible with the registration boundary

---

## Decision 058 — Resolve Workspaces Before Constructing Tools

Status: Accepted

### Decision

Persist named local workspace roots separately from agent definitions. Resolve
the selected workspace before every run and construct a fresh tool registry
whose permission boundary is that workspace root.

### Rationale

Agents should be reusable products rather than copies embedded in every target
repository. Tool permissions, however, must be scoped to the project selected
for that execution.

### Consequences

- one registered agent can operate on many local projects
- run evidence records workspace identity
- workspace registration does not grant capabilities beyond registered tools
- unavailable or unknown workspaces fail before model execution

---

## Decision 059 — Inventory Paths Before Reading Content

Status: Accepted

### Decision

Use a bounded, content-free file inventory as the first discovery operation for
repository agents. Select context from that evidence and read only the chosen
files through the existing bounded reader.

### Rationale

Separating discovery from content access makes context selection visible,
limits unnecessary disclosure, and avoids spending context budget on arbitrary
directory traversal.

### Consequences

- inventory output is deterministic and bounded
- symlink, traversal, deny-list, depth, and size policy remains explicit
- agents must justify and preserve their context-selection evidence

---

## Decision 060 — Require Grounded Documentation Findings

Status: Accepted

### Decision

Accept Documentation Auditor findings only when every cited repository path was
included in the bounded read evidence for that run.

### Rationale

A structured response is not sufficient proof of grounding. Citation validation
connects conclusions to observable project evidence and turns unsupported model
claims into explicit unsuccessful runs.

### Consequences

- the auditor remains read-only and provider-neutral
- unsupported citations fail assessment even if the JSON schema is valid
- full inventory, reads, prompt, provider output, and assessment are retained

---

## Decision 061 — Project Persisted Evidence Into UI Contracts

Status: Accepted

### Decision

Render and export artifacts through a runtime-validated presentation contract.
Keep agent-specific projection in deterministic backend code, provide a generic
fallback, and retain the complete raw artifact as the source of truth.

### Rationale

Directly traversing arbitrary agent output in React would couple the console to
private evidence shapes and make historical compatibility difficult. A stable
presentation boundary lets multiple agents expose useful views without
weakening artifact validation or duplicating workflow logic in the browser.

### Consequences

- presentation does not alter or replace persisted evidence
- malformed specialized evidence falls back visibly instead of crashing views
- report exports contain presentation evidence rather than hidden source text
- new agents can add projectors without changing the generic run page

---

## Decision 062 — Inspect Saved Citations Without Re-reading Workspaces

Status: Accepted

### Decision

Exclude source content from ordinary presentations and report exports. Reveal
an exact saved context item only after the operator selects one of the cited
paths. Do not read the current filesystem to satisfy artifact citation views.

### Rationale

Repository files may change after a run. Re-reading them would display new
content as though it supported an older conclusion. Separating source metadata
from deliberate snapshot disclosure also limits accidental exposure in routine
reports.

### Consequences

- citations remain tied to the model's actual context snapshot
- normal Markdown and JSON reports do not embed repository source content
- complete raw evidence remains deliberately downloadable
- source availability is limited to context persisted with that artifact

---

## Decision 063 — Separate Tool Proposal From Tool Installation

Status: Accepted

### Decision

Introduce Tool Builder first as an experimental, no-tool, no-write agent. It
may generate only structured implementation proposals containing bounded
contracts, new tool and test files, registry guidance, verification commands,
and security notes. Deterministically validate proposal paths, required
artifacts, side-effect authorization, and disposition completeness. Defer file
application, dependency installation, compilation, and command execution to a
separate future workflow.

### Rationale

Generated executable code creates a materially larger permission boundary than
generated design evidence. Proposal quality and safety decisions need a
versioned dataset before the platform trusts generated code enough to compile
or install it. Separating the stages also preserves a human-review point and
prevents the model from treating successful generation as successful
integration.

### Consequences

- Tool Builder can be used and evaluated without workspace read or write access
- safe proposals, clarification requests, and security rejections are explicit
- generated paths cannot target arbitrary repository files
- side effects require affirmative operator authorization
- installation will require isolated verification, review, and rollback policy

---

## Decision 064 — Inject Tool Permission Roots at Registration

Status: Accepted

### Decision

Construct the dependency-version auditor with the selected workspace root and
do not accept a replacement permission root in tool input. Permit callers to
narrow the scan with a repository-relative path and bounded limits only.

### Rationale

A model- or user-supplied permission root would let a valid-looking tool call
expand its own filesystem authority. Registration-time injection keeps the
platform responsible for authorization while preserving reusable tool code.

### Consequences

- the same tool can be rebuilt safely for every registered workspace
- traversal and escaped symbolic links are rejected at the shared path boundary
- scans are inspectable and deterministically bounded
- broader filesystem access requires a separate platform policy change

---

## Decision 065 — Persist Evaluations as Immutable Evidence Indexes

Status: Accepted

### Decision

Persist every completed agent verification as an immutable evaluation
experiment that freezes configuration and references its complete dataset-run
artifacts. Resolve references for case and trial presentation, and align
baseline-versus-candidate comparisons by stable dataset and case IDs. Permit
downloadable dataset-case drafts, but do not mutate versioned datasets from the
browser.

### Rationale

Individual run reports are useful for debugging but do not answer which agent
version was tested, against which corpus, under which execution policy, or how
it compares with a prior configuration. Copying full evidence into another
artifact would create competing sources of truth. A compact experiment index
provides durable history and comparison while retaining exact traceability to
the original evidence.

### Consequences

- evaluation history is reproducible and attributable to frozen configuration
- raw prompts, outputs, assessments, and failures remain stored once
- comparisons only claim what aligned observed cases support
- regression promotion remains an explicit reviewed source-control change
- older dataset artifacts remain readable but do not appear as experiments

---

## Decision 066 — Expose Verification as Fixed Actions, Not a Shell

Status: Accepted

### Decision

Add a workspace-scoped verification tool whose caller selects only typecheck,
the full test suite, or one canonical existing TypeScript test file. Construct
the npm executable and arguments in application code, use a fixed deadline and
output ceiling, restrict the child environment, and preserve exit, signal,
output, truncation, and pass evidence. Do not describe this boundary as an
operating-system sandbox.

### Rationale

Workflow agents need to validate conclusions, but a general shell would let a
model expand its own authority and make evaluation behavior difficult to
reproduce. Fixed actions cover the immediate engineering loop while keeping
the command surface inspectable. Local project scripts still execute code, so
honest security terminology is necessary.

### Consequences

- agents cannot supply executables, shell syntax, working directories, or
  arbitrary arguments
- targeted tests must already exist inside the selected workspace
- failed tests remain useful completed evidence rather than tool crashes
- API credentials are not inherited from the workbench process
- only trusted workspaces should be verified without stronger isolation
- Playwright profiles require a later explicit allowlist decision

---

## Decision 067 — Keep Dataset Ground Truth Outside Agent Input

Status: Accepted

### Decision

Allow agent dataset cases to contain optional hidden JSON expectations. Pass
only the case input to the agent, then invoke a registered deterministic case
assessor with the agent result and hidden expectation. Record runtime success
and case correctness separately, and calculate case reliability from both.

### Rationale

A successful model call and schema-valid response do not prove that an agent
made the correct decision. Putting the expected answer into the prompt would
leak the evaluation oracle and make the resulting reliability measurement
meaningless. Agent-specific assessors preserve a provider-neutral dataset
runner while allowing domains to define what correctness means.

### Consequences

- hidden expectations are persisted as evaluation policy but never sent to the
  model
- agents must explicitly support expected cases before a dataset begins
- incorrect structured answers can fail even when execution succeeds
- Evaluation Studio can display both operational and semantic outcomes
- expectations remain reviewed, versioned source rather than model-generated
  truth

---

## Decision 068 — Ground Playwright Triage in Bounded Named Evidence

Status: Accepted

### Decision

Build Playwright failure triage from a strict sanitized failure contract,
explicit repository-relative source paths, bounded read evidence, and an
optional fixed targeted-test verification action. Treat all supplied artifacts
as untrusted data and deterministically reject source or verification citations
that the workflow did not actually collect.

### Rationale

Failure triage is useful only when an engineer can trace a diagnosis back to
the observed failure and relevant code. Letting the model browse arbitrarily,
execute a shell, ingest uncontrolled artifacts, or invent citations would make
the result unsafe and difficult to evaluate. The existing controlled tools are
sufficient for a first measurable agent without duplicating an IDE runner's
general-purpose capabilities.

### Consequences

- attachments are metadata only until a dedicated parser is reviewed
- every run preserves the exact read and verification evidence used
- the model cannot expand its own filesystem or command authority
- unsupported conclusions remain visible as gaps or failed citation checks
- additional Playwright capabilities require explicit policy and test cases

---

## Decision 069 — Treat Agent Improvement as an Evidence-Gated Candidate Workflow

Status: Accepted

### Decision

Implement general agent improvement as four separate boundaries: read-only
failure analysis, opt-in candidate-policy construction, frozen comparative
evaluation, and explicit promotion. Require each improvable agent to own a
runtime-validated revision surface. Withhold protected evaluation evidence from
the optimizer, prohibit candidate changes to graders, datasets, tools, or
permissions, and keep released semantic versions source-controlled.

### Rationale

The current agents embed prompts and workflow policy in TypeScript, and the
registry exposes one released version per agent ID. Allowing a model to modify
that code, its own evaluator, or its hidden expectations would make improvement
claims circular and unsafe. A proposal-only analyst plus bounded ephemeral
candidates enables useful optimization while preserving comparable evidence,
human accountability, and rollback.

### Expected Consequences

- improvement can operate on any agent that explicitly opts in
- proposal evidence and candidate behavior remain independently inspectable
- protected cases reduce direct optimization against the complete test corpus
- code, capability, permission, and evaluator changes remain reviewed
  engineering work
- promotion decisions have reproducible baseline and candidate evidence
- the first implementation adds configuration and artifact boundaries before
  attempting experience ingestion or external CI integration

Slice A validated the evidence and proposal contracts, registered the analyst
without tools, withheld hidden expectations from optimizer input, persisted
proposal artifacts, and exposed the read-only workflow in Evaluation Studio.
Executable candidates remain prohibited until an agent opts into a bounded
revision surface.

---

## Decision 070 — Require Subject-Owned Opt-In Revision Surfaces

Status: Accepted

### Decision

Allow an agent registration to opt into revision by declaring a
runtime-validated policy schema, frozen baseline policy, exact mutable-field
allowlist, and subject-owned in-memory candidate factory. Keep this capability
optional. Use Documentation Auditor as the first pilot and expose only its
instructions and bounded context-selection policy.

### Rationale

Agent behavior is currently embedded in typed source alongside permissions,
contracts, assessment, and orchestration. A generic optimizer must not rebuild
those registrations or infer which fields are safe to change. Subject-owned
construction keeps fixed behavior in reviewed code while giving improvement
workflows one explicit, testable policy boundary.

### Consequences

- agents without a revision surface remain proposal-only
- baseline and candidate policies are runtime validated
- candidate construction does not mutate source or the platform registry
- Documentation Auditor tools, permissions, contracts, datasets, citation
  evaluation, and assessment remain fixed
- historical or unregistered evaluation subjects remain analyzable without
  gaining candidate authority
- candidate identity, effective-policy digests, protected evaluation, and
  promotion remain separate subsequent controls

---

## Decision 071 — Separate Candidate Identity From Released Versions

Status: Accepted

### Decision

Build temporary candidates by revalidating a policy-approved proposal patch
against the subject's live revision surface. Assign each candidate a unique
evaluation-only ID while retaining the released agent ID and semantic version.
Record the source proposal plus deterministic baseline and effective-policy
digests, and allow this identity to appear optionally in run evidence.

### Rationale

A temporary policy candidate is not a released agent version. Reusing semantic
versions as candidate identifiers would make persisted evidence ambiguous,
while mutating the platform registry would weaken rollback and source-control
boundaries. Policy digests make effective behavior attributable even when two
candidates originate from separate proposal attempts.

### Consequences

- candidate patches are rechecked against supplied evidence and mutable fields
- stale, schema-invalid, unauthorized, and no-op patches are rejected
- candidate construction must preserve the released manifest, permissions,
  output contract, and dataset-assessment capability
- historical run artifacts remain valid because candidate identity is optional
- candidate runs can be grouped by effective policy without claiming a release
- protected datasets and comparative promotion gates remain separate work
