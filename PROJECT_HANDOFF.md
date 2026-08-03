# Agentic Engineering Workbench — Project Handoff

## Project Purpose

`agentic-engineering-workbench` is a local TypeScript platform for developing, running, evaluating, and debugging reusable AI-agent harnesses.

The project combines two ideas:

1. An Agent Reliability Lab
2. A Local AI Engineering Assistant

The goal is to learn how reliable agent systems are built around a model while creating reusable engineering infrastructure.

The project is not intended to be:

- a ChatGPT web workflow
- a single hardcoded agent
- a multi-agent swarm built without a clear need
- an enterprise SaaS platform
- a replacement for LangSmith or similar hosted products

It may later integrate with external observability platforms, but the local repository remains the source of truth.

## User Background

The user is transitioning from Staff/Lead SDET and Quality Engineering leadership into AI Engineering.

Existing strengths include:

- automation framework architecture
- Playwright and TypeScript
- API testing
- CI/CD
- test strategy
- quality gates
- failure diagnosis
- release-readiness evidence
- deterministic testing
- evaluation design
- technical leadership

The project should help extend those skills into:

- agentic harnesses
- context engineering
- agent evaluation
- adversarial agents
- structured agent workflows
- observability
- reliability measurement
- Hermes
- Grok Build

Hermes and Grok Build have not yet been integrated. Their exact internal meaning and usage must be confirmed before implementation.

## Environment

- macOS
- Cursor
- Node.js
- TypeScript
- Vitest
- Zod
- OpenAI Responses API
- Local Git repository
- API key stored in `.env`

Repository location:

```text
~/Projects/agentic-engineering-workbench
```

## Current Implemented Capabilities

The project currently supports:

- an `AIProvider` interface
- an `OpenAIProvider`
- a `FakeProvider`
- role definitions loaded from Markdown
- task definitions loaded from Markdown
- context items loaded from files
- Zod runtime validation
- prompt construction
- a `SimpleHarness`
- reusable evaluator interfaces
- multiple deterministic evaluators
- reusable harness definitions
- a harness registry
- scenario definitions
- a scenario registry
- Zod-validated scenario-suite definitions
- a scenario-suite registry
- scenario-suite reference resolution
- bounded-concurrency scenario-suite execution
- injected scenario execution behavior
- preflight rejection before partial suite execution
- suite-run result collection preserving ordered `HarnessResult` evidence
- runtime-validated repeated scenario execution
- scenario-major ordering of repeated run evidence
- shared runtime-validated repetition and concurrency policy
- deterministic evidence ordering across concurrent completion
- pure suite evidence summarization
- suite-level total, passed, failed, and pass-rate metrics
- suite execution-failure counts by provider-neutral category
- suite evaluator-failure counts by evaluator ID
- separate outcome and diagnostic summaries
- Zod-validated scenario dataset cases and definitions
- a scenario dataset registry
- dataset-to-scenario policy resolution
- registered audience-specific agentic-harness inputs
- bounded-concurrency scenario dataset execution
- injected resolved-case execution behavior
- dataset case identity preserved alongside complete run evidence
- dataset preflight rejection before partial execution
- shared suite and dataset execution policy
- case-major repeated dataset execution
- per-case dataset reliability metrics
- executable dataset CLI backed by `SimpleHarness`
- aggregate case-linked dataset evidence persistence
- validated baseline-versus-candidate experiment definitions
- executable controlled role-comparison experiments
- persisted baseline, candidate, and per-case comparison evidence
- per-case latency summaries and baseline-versus-candidate comparison
- provider-neutral model and token-usage evidence
- per-case token and estimated-cost experiment comparisons
- dated, source-linked GPT-5.4 standard pricing policy
- explicit baseline and candidate model configuration
- controlled GPT-5.4 versus GPT-5.4 mini comparisons
- per-case Wilson 95% reliability confidence intervals
- explicit confidence-interval relationship evidence
- deterministic baseline-versus-candidate reliability comparison
- explicit regression, improvement, unchanged, and insufficient-evidence states
- optional scenario resolution
- harness and scenario evaluator composition
- scenario-specific Zod output contracts
- provider-neutral generation requests and results
- plain-text and structured OpenAI generation
- raw, parsed, and refusal evidence preservation
- provider transport, parsing, and unknown failure evidence
- schema-derived parsed-output type propagation
- CLI harness selection
- persisted JSON run records
- overall pass/fail status
- duration tracking
- unique run IDs
- recorded harness IDs
- recorded scenario IDs
- structured evidence for each run
- generic Zod-validated tool definitions
- structured tool-call evidence and failure classification
- root-bounded `list-files` with traversal, symlink, deny-list, and output-limit policy
- operator-facing controlled-tool CLI
- shared canonical repository-path permission resolver
- bounded UTF-8 `read-file` capability and CLI
- oversized, binary, invalid-text, traversal, symlink, and denied-path rejection
- bounded literal `search-text` capability and CLI
- deterministic path, line, column, and preview search evidence
- bounded `inspect-package` capability and CLI
- validated, deliberately minimized package metadata evidence
- bounded working-tree and staged `inspect-git-diff` capability and CLI
- fixed Git invocation policy and explicit untracked-path evidence
- validation, permission, timeout, and execution tool-failure categories
- explicit repository-inspection workflow and CLI
- ordered package, repository-shape, and Git-change evidence
- workflow identity, timing, status, and continue-on-failure collection
- deterministic observed-file-only context selection
- context-candidate priority, rationale, and completeness evidence
- bounded priority-ordered repository context loading
- per-file and aggregate context byte limits
- accepted, rejected, and tool-call-linked context evidence
- persistent local workspace registration and resolution
- workspace-scoped tool construction and run evidence
- bounded content-free repository file inventory
- a read-only, evidence-grounded Documentation Auditor agent
- balanced documentation and implementation context selection
- a web workspace switcher and workspace-filtered artifact inventory
- a visual tool catalog with contracts and consuming agents
- a runtime-validated artifact presentation boundary
- a specialized visual Documentation Auditor report
- deterministic metrics, findings, actions, coverage, timeline, and usage views
- citation inspection from exact persisted context snapshots
- Markdown, presentation JSON, and raw-evidence artifact downloads
- runtime-validated, root-bounded persisted harness-run loading
- evidence-aware batch discovery across mixed historical run artifacts
- deterministic run outcome, latency, failure, model, usage, and cost reports
- optional model-judge and disagreement report summaries
- replay from saved role, task, context, harness, and scenario inputs
- replay outcome and evaluator-policy comparison
- persisted report and replay evidence
- provider-neutral repository-analysis request builder
- structured citation-bearing repository-analysis output contract
- pre-provider context-evidence integrity validation
- injected repository-analysis provider runner
- unified inspection, request, provider, refusal, failure, and timing evidence
- persisted repository-analysis artifacts
- live `analyze-repository` CLI with model and instruction configuration
- deterministic repository-analysis citation evaluation
- exact available, cited, and invalid context-path evidence
- tracked and untracked working-tree path evidence
- deterministic change-aware context selection
- changed-file priority after repository instructions
- reusable schema-validated multi-step workflow runner
- explicit step limits, stop reasons, and partial-failure traces
- inspect-analyze-verify repository assistant workflow
- deterministic repository-analysis review checks
- persisted assistant workflow evidence and CLI
- registered adversarial instruction-defense scenario
- strict structured defense-decision contract
- prompt-injection, instruction-conflict, and tool-misuse dataset cases
- attack identity and expected-defense run evidence
- protected-marker leakage evaluation
- dedicated untrusted-context defender role
- strict structured model-judge output contract
- versioned asynchronous model-based evaluator runner
- judge provider, usage, cost, latency, and failure evidence
- deterministic-versus-model disagreement evidence
- explicit uncertain-judgment semantics
- strict, serializable agent manifests separated from typed executable registrations
- an immutable platform agent catalog with startup preflight validation
- platform-supplied providers, workspace boundaries, and least-privilege tool subsets
- versioned agent-run evidence with manifest digests and lifecycle status
- separate runtime-validity and goal-assessment outcomes
- operator commands to list, describe, validate, inventory, run, and test agents
- a registered Repository Assistant agent
- version-matched agent datasets, verification gates, and persisted test evidence
- a registered Change Risk Reviewer agent with exact repository-path citations
- active, experimental, deprecated, and retired agent lifecycle enforcement
- a shared application service used by agent CLI and HTTP entry points
- runtime-validated filesystem persistence for agent and verification artifacts
- a loopback-only Fastify API with asynchronous operation lifecycle evidence
- a React/Vite agent operations console
- visual catalog, manifest, permission, workflow, dataset, and contract inspection
- schema-guided live runs, including string-array inputs and omitted blank
  optional fields, plus product-level verification
- filtered evidence browsing with deliberate raw-artifact disclosure
- a safe no-overwrite agent package scaffold command
- an experimental no-write Tool Builder agent
- structured tool contracts, proposed source, tests, registration guidance,
  verification commands, and security notes
- deterministic generated-path, side-effect, completeness, and verification
  policy checks
- generated tool files may use safe camelCase names under `src/tools/` and
  `tests/` without an artificial `Tool` filename suffix
- a registered read-only dependency-version auditor with workspace-root,
  traversal, symlink, file-count, byte-count, and depth boundaries
- deterministic dependency-version findings with malformed-manifest evidence
- immutable agent-evaluation experiments referencing complete dataset artifacts
- frozen agent, workspace, model, repetition, and concurrency configuration
- aggregate, dataset-case, and repeated-trial Evaluation Studio views
- aligned baseline-versus-candidate reliability comparisons by stable case ID
- downloadable regression-case drafts without browser-side dataset mutation
- a registered controlled verification-command tool with fixed npm actions
- targeted test-path canonicalization and workspace escape rejection
- bounded command output, timeout, exit, signal, and pass evidence
- restricted child-process environment without inherited API credentials
- explicit controlled-process versus operating-system-sandbox distinction
- optional hidden JSON expectations on versioned agent dataset cases
- deterministic case-specific assessment separated from agent runtime success
- expectation and case-assessment evidence in Evaluation Studio drill-down
- a registered experimental `playwright-failure-triage` agent and smoke dataset
- strict sanitized Playwright failure, attachment-metadata, and diagnosis
  contracts
- bounded source inspection and optional fixed targeted-test verification
- explicit untrusted-data prompt boundaries and deterministic citation checks
- three representative hidden-ground-truth triage cases
- specialized diagnosis, action, gap, source, and timeline presentation
- a registered read-only `agent-improvement-analyst` with no tool permissions
- bounded failed-evaluation packet assembly with hidden expectations withheld
- deterministic evidence citation and candidate-patch policy validation
- immutable `agent-improvement-proposal` artifacts linked to source experiments
- Evaluation Studio failure-analysis operations and specialized proposal views
- opt-in runtime-validated agent revision surfaces
- frozen baseline policies with exact mutable-field allowlists
- a Documentation Auditor instruction and context-selection revision policy
- subject-owned in-memory candidate construction without source mutation
- revision-surface projection into improvement evidence for registered subjects
- deterministic baseline and effective-policy digests
- evaluation-only candidate identity linked to source proposals
- validated proposal-patch merging through subject-owned revision surfaces
- optional candidate identity preserved in backward-compatible run evidence
- explicit development, regression, and protected dataset purposes
- dataset purpose frozen into run and evaluation artifacts
- protected inputs, expectations, outcomes, trials, and aggregate signals
  withheld from optimizer evidence
- deterministic candidate-evaluation plan digests over frozen datasets,
  workspace, model, and execution policy
- exact baseline output and dataset-case graders reused for candidates
- baseline and candidate execution from one immutable in-memory plan
- candidate identity preserved in candidate evaluation and trial evidence
- immutable candidate-comparison artifacts referencing frozen plan, evaluation,
  and dataset-run evidence
- candidate-comparison listing, loading, export, and generic presentation
- deterministic completeness, scope, regression, protected, improvement, and
  latency promotion gates
- explicit non-applicable cost evidence when providers expose no usage data
- gate outcomes embedded in candidate-comparison artifacts and presentations

## Current Evaluators

Implemented deterministic evaluators:

- `NonEmptyOutputEvaluator`
- `MinimumLengthEvaluator`
- `RequiredPhraseEvaluator`
- `ForbiddenPhraseEvaluator`
- `RequiredSectionEvaluator`
- `StructuredOutputEvaluator`

Evaluators receive:

```ts
{
  role,
  task,
  context,
  prompt,
  output
}
```

## Current Harness Definitions

### `technical-coach`

General purpose: explain technical concepts clearly and practically.

Current evaluators:

- nonempty output
- minimum length of 100
- forbidden phrase: `I cannot help`

Task-specific checks are intentionally excluded from this reusable harness.

### `basic-reliability`

General purpose: apply basic reliability checks to any task.

Current evaluators:

- nonempty output
- minimum length of 20

## Current Scenario Architecture

Current files:

```text
src/scenarios/scenarioDefinition.ts
src/scenarios/explainAgenticHarnessOutput.ts
src/scenarios/explainAgenticHarnessScenario.ts
src/scenarios/scenarioRegistry.ts
src/evaluations/structuredOutputEvaluator.ts
```

Registered scenario:

```text
explain-agentic-harness
```

The scenario contains:

```text
RequiredPhraseEvaluator("agentic harness")
StructuredOutputEvaluator(explainAgenticHarnessOutputSchema)
```

The scenario exposes `explainAgenticHarnessOutputSchema` for provider-supported
structured generation. The related task requests content aligned with the
schema fields.

## Current Verified State

Current milestone:

```text
Phase 39 Playwright Failure Triage agent: complete foundation
Phase 40 Slice A read-only improvement analysis: complete
Phase 40 Slice B opt-in candidate policies: complete
Phase 40 Slice C protected evidence boundary: complete foundation
Phase 40 Slice C frozen comparative execution: complete foundation
Phase 40 Slice C immutable comparison evidence: complete foundation
Phase 40 Slice C deterministic promotion gates: complete foundation
```

Verified test state:

```text
npm run typecheck passed
119 test files passed
360 tests passed
```

This state must be verified before continuing:

```bash
git status
git log --oneline -5
npm run typecheck
npm test
```

## Current Scenario Resolution

```text
Harness evaluators always run.
Scenario evaluators run when a scenario definition exists.
```

The CLI resolves scenarios by task ID with `findScenarioDefinition`.
Tasks such as `connection-check` intentionally run with harness evaluators only.
The composed evaluator list is created before model execution.
Each run records the matched scenario ID or explicit `null`.
When a scenario exposes an output schema, the CLI passes it through
`SimpleHarness` to the provider request.

## Immediate Next Step

Add comparable provider usage evidence to agent runs so the cost promotion gate
can enforce its configured tolerance. Then begin Slice D with immutable
operator approve, reject, or revise decisions over candidate comparisons.

## Broader Roadmap

1. Add opt-in agent revision surfaces and use Documentation Auditor as the
   first executable candidate subject.
2. Add protected evaluation cases, frozen candidate comparison, and promotion
   decision evidence.
3. Exercise Playwright Failure Triage against reviewed real failures.
4. Add isolated compilation and tests for approved Tool Builder proposals.
5. Export proven agents to runner-specific packages when ready for use.
6. Extract agents or replace filesystem persistence only when demonstrated
   ownership, deployment, permission, or query requirements demand it.
