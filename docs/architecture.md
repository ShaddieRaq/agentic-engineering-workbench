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

Correctness and latency remain separate comparison signals. Per-case latency
evidence records sample count, average, minimum, and maximum duration for each
variant. Candidate-minus-baseline average duration is classified as faster,
slower, unchanged, or insufficient evidence. These are observed timings, not
claims of statistical significance.

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

### Controlled Tools

Tools are deterministic capabilities exposed through a generic execution
controller. A tool definition owns its ID, description, Zod input/output
schemas, and capability implementation. The controller validates input,
executes the capability, validates output, and records one `ToolCallEvidence`
result containing timing, normalized input, output, and classified failure.

The initial tools operate beneath an operator-selected repository root:

- `list-files` lists one directory level with deterministic ordering
- `read-file` reads one complete UTF-8 text file within a byte limit
- `search-text` recursively searches UTF-8 files for a literal query
- `inspect-package` returns selected project, script, and dependency metadata
- `inspect-git-diff` returns a bounded tracked patch plus untracked paths

Their shared path policy:

- rejects lexical traversal outside the root
- resolves real paths to prevent symbolic-link escape
- denies `.git`, `.env`, `node_modules`, and `runs` by default
- caps output using both request and policy limits

`read-file` rejects binary, invalid UTF-8, directory, and oversized targets.
It does not silently truncate source because incomplete code can mislead later
analysis. `list-files` separately sorts entries for deterministic evidence.

`search-text` skips symbolic links, denied paths, binary files, and oversized
files. It bounds files inspected, matches returned, output bytes, preview size,
and execution time. Results are ordered by sorted traversal and include path,
line, column, and preview evidence. Queries never pass through a shell or
regular-expression engine.

`inspect-package` composes the bounded `read-file` capability rather than
creating another filesystem permission path. It accepts only files named
`package.json`, validates the parsed manifest, and returns only project
identity, module type, scripts, and dependency maps. Arbitrary manifest fields
are intentionally omitted from tool evidence.

`inspect-git-diff` invokes Git with application-owned argument lists for either
working-tree or staged changes. The caller may select only the mode, context
line count, and requested byte limit. External diff drivers, text conversion,
and color output are disabled. Working-tree evidence also uses a separate fixed
Git query to report untracked paths without reading their contents. Diff and
path evidence share one aggregate byte limit and deadline policy.

The CLI invokes this boundary directly. Model-driven tool selection is not yet
connected; permission enforcement is tested independently first.

### Repository Inspection Workflow

The first local-engineering workflow composes three controlled tools in an
application-owned sequence:

```text
inspect-package -> list-files -> inspect-git-diff
```

Every step retains its complete `ToolCallEvidence`. The workflow adds a stable
workflow ID, unique run ID, total duration, completion time, and overall status.
Because these read-only inspections are independent, later steps still run if
an earlier step fails; the workflow status remains failed while preserving the
other available evidence. The model does not yet choose tools or control this
sequence.

After inspection, a pure repository-orientation selector derives a bounded set
of context candidates from the successful root listing. It may select only
files that were actually observed. Each candidate carries a stable priority and
rationale, and the selection records the source tool-call ID. A failed or
truncated listing marks the selection incomplete; it never causes paths to be
invented. Selection does not read file contents.

The context loader then reads selected candidates in priority order through the
bounded `read-file` tool. It applies a 32,768-byte per-file limit and a 65,536-
byte aggregate context limit. Accepted items record source, priority, rationale,
size, and the owning read tool-call ID. File content remains stored once in that
tool-call evidence. Budget exclusions and read failures are preserved as
separate rejected-candidate reasons, and later candidates may still be tried
after a read failure.

A pure repository-analysis request builder resolves accepted context items back
to their successful read evidence and fails on missing, mismatched, or failed
links. It creates a provider-neutral `AIProviderRequest` containing context
completeness, byte usage, rejected candidates, source labels, selection
rationales, and file content. The associated strict Zod output contract requires
an overview plus citation-bearing architecture components, entry points, risks,
and test recommendations. Request construction does not execute a provider.

The repository-analysis runner accepts an injected `AIProvider`, builds the
validated request, and returns one result containing the complete inspection
workflow, serializable request evidence, raw and parsed output, refusal,
provider usage, classified provider failure, timing, and status. A refusal is
preserved separately from execution failure. Known transport and parsing
failures are translated through the provider-neutral error categories, and
provider exceptions do not reject the analysis run.

The live `analyze-repository` composition root loads `.env`, creates the
controlled inspection tools, runs inspection and context assembly, configures
`OpenAIProvider`, executes analysis, and persists the complete result under
`runs/analysis-run-<id>.json`. It defaults to `gpt-5.4-mini`, accepts an explicit
model and instruction, and prints only a concise operational summary. Full
prompts, source content, structured output, refusals, usage, and failures remain
in the ignored evidence artifact.

After structured generation, a deterministic citation evaluator collects every
evidence path from architecture components, entry points, risks, and test
recommendations. It compares exact repository-relative paths against accepted
context sources. The evaluation records available, cited, and invalid paths.
An otherwise valid model response is unsuccessful when it cites context that
was not assembled, and the CLI reports the evaluation failure separately from
provider failure.

Git inspection also returns explicit tracked and untracked path lists under the
same aggregate output limit as the patch. The context selector keeps
`AGENTS.md` first, then adds changed files in deterministic path order before
the remaining orientation files. Duplicate paths retain their change-analysis
rationale. Changed paths are still read through the shared permission boundary;
deleted, denied, binary, oversized, or otherwise unreadable files remain
visible as rejected context rather than bypassing tool policy.

### Multi-Step Workflow

The reusable multi-step runner accepts a workflow definition containing a
state schema and unique ordered steps. Initial state and every successful state
transition are runtime validated. Each trace step records its index, state
version before and after execution, bounded evidence chosen by the step,
timing, stop reason, and classified execution or validation failure. Full state
is retained once at the workflow result boundary rather than copied into every
trace event.

Execution defaults to fail-fast, but workflows may continue independent later
steps while preserving earlier failure evidence. A positive-integer maximum
step count is enforced before scheduling, and reaching it produces an explicit
unsuccessful `step-limit` status.

The first production composition has three application-owned steps:

```text
inspect -> analyze -> verify
```

Inspection uses the controlled repository tools, analysis uses the injected
provider-neutral request runner, and verification deterministically checks
provider execution, structured output, and citation grounding. Its complete
state and step trace are persisted under `runs/assistant-run-<id>.json`.

### Registered Agent Platform

The agent layer assembles existing components into named products. A harness
supplies reusable execution and evaluation policy; an agent owns a purpose,
input/output contract, workflow, permissions, defaults, and reliability
requirements.

Each registration has two boundaries:

```text
AgentManifest          Typed registration
-------------          ------------------
identity               input schema
version                output schema
lifecycle              executor
component references   domain assessment
tool permissions
verification policy
```

The manifest is serializable catalog data. Executable functions and schemas
remain in the typed registration. The immutable registry rejects duplicate IDs
and lists manifests deterministically. Catalog validation resolves every
workflow, harness, scenario, dataset, and tool reference before execution.

The shared runner limits the tool catalog to the manifest allowlist, validates
JSON and agent-specific input, executes with an injected provider, validates
output, and separately evaluates whether the agent achieved its goal. The
result records agent identity and version, manifest snapshot and digest, model,
permitted tools, lifecycle warnings, output, assessment, failure, and timing.

Definitions live in source control and executions remain ephemeral. Deprecated
agents may execute with warnings; retired agents cannot execute. Verification
evidence must match the current agent version.

Current registered products:

- `repository-assistant`: inspect, analyze, and verify repository architecture
- `change-risk-reviewer`: review changes for grounded risk and missing tests
- `documentation-auditor`: audit repository documentation with cited evidence
- `tool-builder`: generate policy-checked tool proposals without installing code

Agent datasets contain stable JSON inputs for one complete agent. They reuse
the shared repetition and bounded-concurrency policy, preserve case-major
evidence, calculate per-case pass rates, and apply the manifest threshold.

Agents currently live under `src/agents/<agent-id>`. Static imports keep loading
explicit and auditable. The manifest and registration contracts form the later
extraction boundary for separate packages; dynamic plugins and a database
catalog are not required at the current local-first scale.

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

Current uses and possible extensions include:

- technical correctness
- completeness
- groundedness
- usefulness
- nuanced policy compliance

Model-based evaluators should not replace deterministic checks that code can perform reliably.

The model-based evaluator is a separate asynchronous runner over a completed
`HarnessResult`. It sends the task, subject output, deterministic evaluation
evidence, and an explicit criterion list through an injected `AIProvider` using
a strict judge schema. Its evidence includes evaluator and prompt versions,
raw and parsed judgment, refusal, classified provider failure, model and token
usage, estimated cost, and latency.

A disagreement record compares the preserved deterministic outcome with a
model pass or fail verdict. An uncertain judge verdict produces no forced
agreement classification. The judge never mutates the original evaluations or
the harness pass result; downstream reporting decides how much weight to give
this additional signal.

### Adversarial Reliability

Adversarial inputs remain dataset cases rather than executable instructions.
Optional case metadata records a stable attack ID, one bounded attack category,
and explicit expected defenses. The metadata is preserved beside every repeated
`HarnessResult`, so comparisons can be grouped by attack without changing the
general harness evidence contract.

The first adversarial scenario requires structured output whose decision can
only indicate that untrusted instructions were ignored and whose trusted-task
flag can only be `true`. A deterministic forbidden-phrase evaluator separately
detects leakage of the protected fixture marker. Prompt injection, conflicting
instructions, and attempted tool-boundary misuse all reuse this single policy.
Because the existing experiment runner accepts any registered dataset, the
defender role can be compared against a baseline without a new orchestration
path.

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
  provider,
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
failure. `provider` records the actual model plus input, cached-input, output,
reasoning, and total-token usage when the provider supplies it.
`executionFailure` records provider transport, parsing, or unknown
failures and forces the overall run result to fail.

### Reporting and Replay

Persisted-run loading is a separate trust boundary. A report accepts only files
that resolve inside the configured runs root, remain under the byte limit, and
match the current strict `HarnessResult` schema. Batch discovery records both
accepted paths and rejected artifact reasons so mixed historical evidence does
not crash the report or silently contaminate its metrics.

Report calculation is deterministic and operates only on validated runs. It
summarizes outcomes, latency, classified execution and evaluator failures,
models, token usage, estimated cost, and optional model-judge disagreement.

Replay reconstructs execution from the saved role, task, context, harness ID,
and scenario ID. The provider call is new, while the original input and policy
remain explicit. Replay evidence preserves both complete runs and compares the
outcome plus evaluator policy; it does not overwrite the source artifact.

Experiment artifacts preserve observed pass-rate comparisons and Wilson 95%
confidence intervals separately. The interval relationship describes whether
the ranges overlap; it is not labeled as statistical significance.

### Registry

Registries resolve reusable definitions by ID.

Current registries:

- harness registry
- scenario registry
- scenario dataset registry
- scenario suite registry
- tool registry
- workflow registry
- agent dataset registry
- agent registry

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

Provider implementations receive model selection as configuration. The actual
model returned by the provider is preserved in run evidence, so requested and
observed behavior can be audited without leaking provider fields into the
harness contract.

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

## Local Agent Operations Console

The CLI and web console share one application boundary rather than duplicating
agent behavior:

```text
CLI commands ----------------------+
                                   |
React console -> loopback Fastify -+-> AgentApplicationService
                                          |
                                          +-> immutable AgentRegistry
                                          +-> permission-filtered ToolRegistry
                                          +-> provider-neutral AgentRunner
                                          +-> agent dataset verification
                                          +-> FileArtifactStore
```

`AgentApplicationService` owns catalog description, execution, verification,
and artifact persistence. Entry points translate operator input into service
requests; they do not implement alternate agent runtimes.

The Fastify API exposes read-only catalog and artifact operations without model
credentials. Run and verification requests become in-memory background
operations with ordered lifecycle events. The API supports polling and
server-sent event streams while preserving one terminal operation snapshot.

The React client is a static Vite build served by the same loopback process. It
uses only fixed local routes, renders Zod-derived JSON schemas as guided forms,
normalizes string-array fields from one item per line, omits blank optional
fields, and requires a deliberate disclosure before showing complete raw
evidence.

### Artifact Persistence

The filesystem remains the source of truth. `FileArtifactStore` adapts current
agent-run and agent-dataset-run schemas to immutable JSON files under `runs/`.
Reads are filename constrained, byte bounded, runtime validated, filterable,
and explicit about rejected historical or incompatible artifacts. A database
is deferred until query scale, concurrent writers, or deployment requires it.

### Web Security Boundary

The console is a local control plane, not a remotely hosted application. It:

- binds to `127.0.0.1`
- rejects non-loopback hostnames and browser origins
- applies a strict content security policy and response hardening headers
- limits JSON request bodies
- exposes only registered agent and artifact operations
- never accepts shell commands or browser-authored executable agent code

### Agent Authoring Boundary

Agent definitions remain reviewed TypeScript products. The scaffold command
creates a safe experimental package structure with contracts, executor,
assessment, dataset, and test. The author then explicitly registers the module.
This keeps visual learning and operations convenient without replacing source
control, type checking, or runtime validation.

### Tool Builder Flow

```text
plain-language capability request
        |
        v
strict structured generation
        |
        v
propose | needs-clarification | reject
        |
        v
deterministic proposal-policy evaluation
        |
        v
persisted agent evidence for review
```

Tool Builder `0.1.0` has an empty tool allowlist. It cannot inspect a workspace,
write generated files, add dependencies, or execute commands. A complete
proposal must contain a bounded tool contract, one implementation file, one
test file, registry guidance, and explicit verification commands. Generated
file paths are restricted to new `src/tools/*Tool.ts` and
`tests/*Tool.test.ts` proposals. Side effects must be explicitly authorized.

Clarification and rejection are first-class successful dispositions when no
installable files are emitted. A later installation workflow must remain a
separate permission boundary with isolated compilation, tests, and human
approval.

## Workspace Resolution

The platform registry describes reusable agents, but each execution resolves a
separate local workspace. `FileWorkspaceStore` persists only workspace identity
and an absolute root path. Before a run, `AgentApplicationService` resolves the
selected workspace and constructs a fresh root-bounded `ToolRegistry` for it.

This separates reusable agent code from the projects it operates on. One agent
can therefore run against many registered repositories without copying agent
implementations or weakening tool permissions. Persisted run artifacts record
the workspace ID so evidence remains attributable.

## Documentation Auditor Flow

```text
registered workspace
        |
        v
bounded file inventory -> balanced context selection -> bounded file reads
        |                                                   |
        +---------------- evidence -------------------------+
                                                            v
                                              structured model analysis
                                                            |
                                                            v
                                   citation validation + persisted evidence
```

The auditor is read-only. It receives only `file-inventory` and `read-file`,
balances documentation and implementation context under an aggregate byte
budget, and accepts findings only when their cited paths were actually read.

## Artifact Presentation and Export

Persisted artifacts remain the source of truth. A deterministic presentation
layer projects validated artifacts into a smaller UI contract containing
identity, metrics, findings, actions, sources, timeline, usage, and warnings.
Agent-specific projectors may enrich that contract; incompatible specialized
evidence falls back to a generic presentation with an explicit warning.

The Documentation Auditor projector deliberately removes source content from
the ordinary presentation and report exports. Citation selection retrieves the
exact saved context snapshot through a separate endpoint after deliberate user
interaction. It never re-reads the current workspace, which prevents a changed
file from being confused with evidence observed during the original run.

Markdown and JSON reports are generated from the presentation contract. A
separate raw-evidence download preserves the complete runtime-validated
artifact for debugging and automation.
