# Project Roadmap

## Product Direction

Build a local agent engineering and reliability platform for:

- developing reusable harnesses
- running engineering tasks
- controlling context
- evaluating results
- recording evidence
- comparing reliability
- experimenting with adversarial behavior
- understanding agent-system architecture

## Phase 1 — Core Project Foundation

Status: Complete

Implemented:

- Node.js and TypeScript setup
- Vitest
- Zod
- OpenAI SDK
- environment configuration
- local Git repository
- CLI entry point
- type checking
- test scripts

Exit criteria:

- project compiles
- tests run
- live model connection works

## Phase 2 — Provider Abstraction

Status: Complete

Implemented:

- `AIProvider`
- `OpenAIProvider`
- `FakeProvider`
- provider injection into the harness

Lessons:

- interfaces
- dependency injection
- provider neutrality
- offline testing

## Phase 3 — Core Harness

Status: Complete

Implemented:

- role loading
- task loading
- context loading
- prompt construction
- runtime validation
- unique run IDs
- execution duration
- structured run results
- JSON persistence

## Phase 4 — Deterministic Evaluation

Status: Complete foundation

Implemented:

- evaluator interface
- full evaluation input
- nonempty output evaluator
- minimum length evaluator
- required phrase evaluator
- forbidden phrase evaluator
- required section evaluator
- multiple evaluator execution
- overall pass/fail status
- CLI evaluation output

Still needed:

- structured JSON evaluator
- context-grounding checks
- expected-value evaluator
- richer failure classifications

## Phase 5 — Reusable Harness Definitions

Status: Complete foundation

Implemented:

- `HarnessDefinition`
- `technicalCoachHarness`
- `basicReliabilityHarness`
- harness registry
- CLI harness selection
- harness ID recorded in run results
- task-specific checks moved out of general harnesses

Still needed:

- configurable provider/model settings
- harness-level execution limits
- harness-level retry policy

## Phase 6 — Scenario Definitions

Status: Complete foundation

Implemented:

- `ScenarioDefinition`
- `explainAgenticHarnessScenario`
- scenario registry
- scenario registry tests
- optional scenario lookup
- harness and scenario evaluator composition
- intentional support for tasks without scenario definitions
- scenario-specific required phrase and required section evaluation
- scenario ID recorded in run results

Exit criteria:

- general harness policy remains reusable
- scenario-specific expectations remain isolated
- tasks without scenarios behave intentionally
- scenario evaluations appear in persisted evidence

## Phase 7 — Structured Output

Status: Complete foundation

Implemented:

- scenario-specific Zod output contract for `explain-agentic-harness`
- optional output schema on `ScenarioDefinition`
- provider-neutral request and result contracts
- schema propagation from scenario selection through the harness
- OpenAI Zod structured-output parsing
- explicit refusal preservation
- deterministic invalid-JSON and schema-mismatch evaluation
- persisted raw, parsed, and refusal evidence
- removal of the legacy string-only provider path
- provider parsing, transport, and unknown failure evidence
- schema-derived parsed-output types propagated through providers and harnesses

## Phase 8 — Scenario Suites

Status: Complete

Implemented:

- Zod-validated scenario-suite definitions
- nonempty and unique scenario membership
- `core-reliability` suite definition
- scenario-suite registry
- suite-to-scenario reference resolution
- rejection of unknown scenario references
- bounded-concurrency scenario-suite runner
- injected scenario executor
- preflight resolution before any scenario executes
- collected `HarnessResult` evidence in suite order
- suite-run result contract containing the suite ID and run records
- shared runtime-validated repetition and concurrency policy
- repeated runs with deterministic scenario-major evidence ordering
- pure suite-evidence summarization
- total, passed, and failed run counts
- suite pass-rate ratio with explicit no-evidence semantics
- provider execution-failure counts by category
- evaluator-failure counts by evaluator ID
- separate outcome and diagnostic summaries
- Zod-validated scenario dataset cases
- nonempty datasets with unique case IDs
- explicit task and context inputs per case
- registered `agentic-harness-audiences` dataset
- dataset-to-scenario policy resolution
- rejection of unknown scenario policy references
- bounded-concurrency dataset-case execution
- injected resolved-case executor
- dataset and case identity preserved with each `HarnessResult`
- preflight rejection before any dataset case executes
- shared execution policy across suite and dataset runners
- case-major repeated dataset execution
- pure per-case reliability summarization
- per-case total, passed, failed, and pass-rate metrics
- pure baseline-versus-candidate pass-rate comparison
- explicit improved, regressed, unchanged, and insufficient-evidence states
- preserved baseline, candidate, and delta evidence
- positive-integer concurrency limits with a sequential default
- ordered concurrent mapping that preserves execution-plan evidence order

## Phase 9 — Reliability Experiments

Status: Complete foundation

Implemented:

- executable dataset CLI using registered datasets, roles, and harnesses
- production dataset executor adapter backed by `SimpleHarness`
- aggregate dataset evidence persistence with case identity and summaries
- Zod-validated baseline-versus-candidate experiment definitions
- controlled role-instruction comparison over one shared dataset and harness
- complete baseline and candidate evidence persistence
- per-case reliability comparison in the experiment CLI
- per-case latency sample count, average, minimum, and maximum
- observed candidate-versus-baseline average-latency comparison
- provider-neutral model and token-usage evidence on every successful run
- input, cached-input, output, reasoning, and total-token preservation
- auditable GPT-5.4 standard short-context pricing policy
- per-case baseline-versus-candidate token and estimated-cost comparison
- explicit insufficient-evidence behavior for missing or unsupported usage
- explicit baseline and candidate model configuration
- controlled GPT-5.4 versus GPT-5.4 mini experiment support
- per-case Wilson 95% reliability confidence intervals
- explicit interval-overlap relationships without significance claims

Future extensions:

- compare context strategies
- compare prompts
- formal significance tests and experiment power guidance

## Phase 10 — Controlled Tools

Status: Complete

Implemented:

- generic typed tool-definition contract
- Zod-validated tool inputs and outputs
- shared tool executor with structured call evidence
- validation, permission, and execution failure categories
- root-bounded immediate-directory `list-files` tool
- lexical traversal and symbolic-link escape protection
- denied-path and bounded-output policies
- deterministic entry ordering
- operator-facing `list-files` CLI
- shared canonical repository-path permission resolver
- root-bounded UTF-8 `read-file` tool
- request and application byte limits
- oversized, binary, and invalid-text rejection
- operator-facing `read-file` CLI
- root-bounded literal `search-text` tool
- file, match, preview, output-byte, and deadline limits
- deterministic path, line, column, and preview evidence
- explicit timeout failure classification
- operator-facing `search-text` CLI
- bounded `inspect-package` tool composed from the safe reader
- validated project identity, scripts, and dependency metadata
- operator-facing `inspect-package` CLI
- bounded working-tree and staged `inspect-git-diff` tool
- fixed Git argument policy with external diff behavior disabled
- explicit untracked-path evidence without untracked-content reads
- operator-facing `inspect-git-diff` CLI

Requirements:

- explicit schemas
- allowed-root policies
- timeouts
- output limits
- tool-call evidence
- path traversal protection

## Phase 11 — Local Engineering Assistant

Status: Complete foundation

Implemented:

- explicit repository-inspection workflow
- application-owned package, file-list, and Git-change step order
- complete per-step tool-call evidence
- continue-on-failure collection for independent read-only inspections
- workflow run identity, timing, and overall status
- operator-facing `inspect-repository` CLI
- deterministic repository-orientation context selection
- observed-file-only candidate policy
- per-candidate priority and rationale evidence
- explicit incomplete-selection state for failed or truncated listings
- priority-ordered bounded context loading through `read-file`
- per-file and aggregate byte budgets
- accepted and rejected candidate evidence
- single-copy content evidence linked by tool-call ID
- provider-neutral repository-analysis request construction
- strict structured repository-analysis output contract
- required evidence-path citations for analysis claims
- pre-provider rejection of broken context-to-read linkage
- injected provider execution for repository analysis
- unified inspection, request, response, usage, and timing evidence
- distinct success, refusal, and classified provider-failure states
- persisted complete repository-analysis artifacts
- live `analyze-repository` composition root and CLI
- economical default model with explicit model override
- concise terminal summary separated from full run evidence
- deterministic analysis citation validation
- exact comparison against assembled context sources
- available, cited, and invalid path evidence
- citation evaluation included in overall analysis status
- explicit tracked and untracked working-tree path evidence
- changed-file context prioritized immediately after repository instructions
- deterministic deduplication between change and orientation context
- change-inspection completeness included in context-selection evidence

Initial use cases:

- explain a repository
- identify architecture
- summarize changes
- review a diff
- identify risks
- cite supporting files
- propose a test strategy

## Phase 12 — Multi-Step Workflows

Status: Complete foundation

Implemented:

- reusable validated multi-step workflow definitions
- schema-validated initial state and successful transitions
- unique ordered step IDs
- explicit positive-integer step limits
- successful stop conditions with recorded reasons
- fail-fast or continue-on-failure policy
- execution and state-validation failure evidence
- versioned state transitions without repeated state snapshots
- repository assistant composition: inspect, analyze, verify
- deterministic provider, structure, and citation review checks
- persisted assistant workflow artifacts
- operator-facing `assist-repository` CLI

Possible patterns:

- analyze then review
- planner then executor
- draft then critique
- retrieve then answer
- generate then verify

Requirements:

- step limits
- state representation
- trace records
- stop conditions
- failure handling

## Phase 13 — Adversarial Agents

Status: Complete foundation

Implemented:

- strict structured instruction-defense output contract
- explicit trusted-instruction decision requirement
- protected-marker leakage evaluator
- registered adversarial defense scenario
- prompt-injection dataset case
- conflicting-instruction dataset case
- tool-boundary misuse dataset case
- stable attack ID, category, and expected-defense metadata
- adversarial metadata preserved with every repeated run
- dedicated untrusted-context defender role
- existing dataset experiments reusable for attack/defense comparisons

Planned work:

- prompt-injection scenarios
- malicious context
- tool misuse attempts
- data-leakage checks
- conflicting instructions
- false-completion claims
- adversarial reviewer
- attack/defense comparisons

## Phase 14 — Model-Based Evaluation

Status: Complete foundation

Implemented:

- strict structured judge output contract
- pass, fail, and uncertain verdicts
- bounded zero-to-100 judge score
- criterion-level judgment evidence
- versioned evaluator prompt identity
- provider-neutral asynchronous judge runner
- provider refusal and classified failure preservation
- judge model, token usage, latency, and estimated-cost evidence
- explicit deterministic-versus-model disagreement record
- uncertain verdicts excluded from forced disagreement claims
- deterministic evaluations remain unchanged and primary

Possible uses:

- technical accuracy
- completeness
- groundedness
- clarity
- uncertainty handling

Requirements:

- evaluator prompt versioning
- model metadata
- deterministic checks remain primary
- evaluator disagreement recorded
- cost and latency tracked

## Phase 15 — Reporting and Replay

Status: Complete foundation

Implemented:

- strict runtime validation for persisted harness runs
- root-bounded and size-bounded run loading
- accepted and rejected source-artifact evidence
- deterministic aggregate outcome, latency, failure, model, usage, and cost summaries
- optional model-judgment and disagreement summaries
- replay from saved role, task, context, harness, and scenario inputs
- replay outcome and evaluator-policy comparison
- replay and report artifact persistence
- operator-facing `report` and `replay` commands

Possible extensions:

- time-windowed pass-rate trends
- combined suite and dataset report views
- HTML or Markdown rendering
- optional LangSmith or other trace export

## Near-Term Priorities

The original 15-phase workbench roadmap is complete. The following roadmap
turns that foundation into a catalog of complete agent products.

## Phase 16 — Agent Contracts

Status: Complete

Implemented:

- strict serializable `AgentManifest`
- stable IDs, semantic versions, lifecycle status, owner, tags, and model defaults
- explicit component, permission, and verification references
- typed input and output schemas
- typed registration helper with optional domain assessment

## Phase 17 — Agent Catalog and Resolution

Status: Complete

Implemented:

- immutable deterministic agent registry
- duplicate and unknown agent rejection
- tool and workflow catalogs
- enumeration for existing component registries
- preflight validation of every component and permission reference
- catalog-wide validation evidence

## Phase 18 — Unified Agent Runtime

Status: Complete

Implemented:

- provider-neutral shared `AgentRunner`
- platform-supplied workspace, provider, and permitted tool subset
- JSON and agent-specific input/output validation
- separate runtime-contract and agent-goal assessment
- catalog, input, execution, output, and evaluation failure evidence
- agent ID, version, manifest snapshot, and SHA-256 manifest identity
- model, permissions, lifecycle warnings, timing, and status evidence
- strict persisted `agent-run` artifacts

## Phase 19 — Agent Catalog CLI

Status: Complete

Implemented:

- `agents list`, `describe`, `validate`, and `inventory`
- `agents run` with optional JSON input and model override
- metadata operations without API credentials
- existing specialized commands preserved for compatibility

## Phase 20 — Repository Assistant Agent

Status: Complete

Implemented:

- first active registered agent product
- existing inspect, analyze, and verify workflow reused
- explicit read-only repository permissions
- structured input, output, workflow evidence, and domain assessment

## Phase 21 — Agent Reliability Datasets

Status: Complete foundation

Implemented:

- JSON-validated agent datasets and stable case identity
- case-major repeated bounded-concurrency execution
- per-case pass-rate summaries
- manifest-owned datasets and minimum pass-rate gates
- rejection of evidence from another agent version
- strict aggregate persistence and `agents test` command

## Phase 22 — Change Risk Reviewer Agent

Status: Complete foundation

Implemented:

- second independently versioned agent product
- current-change repository inspection
- structured risk, finding, missing-test, and release recommendation contract
- exact citations against assembled repository evidence
- provider, refusal, usage, failure, and inspection evidence
- registered smoke dataset and 100% per-case gate
- offline end-to-end test through the shared agent platform

## Phase 23 — Lifecycle and Scale Boundaries

Status: Complete foundation

Implemented:

- experimental, active, deprecated, and retired states
- deprecated-run warnings and retired-agent rejection
- deterministic versioned catalog inventory
- manifest fingerprints and version-matched verification
- isolated `src/agents/<agent-id>` packages
- future extraction boundary for separately owned packages

## Phase 24 — Shared Agent Application Services

Status: Complete

Implemented:

- one service for catalog description, runs, verification, and persistence
- CLI and HTTP adapters sharing the same execution behavior
- provider factory and artifact-store injection for deterministic testing

## Phase 25 — Validated Artifact Store

Status: Complete

Implemented:

- immutable filesystem-backed agent artifacts
- current-schema validation on write and read
- bounded loading, query filters, deterministic ordering, and rejection evidence
- compatibility adapters for the existing agent writers

## Phase 26 — Loopback Agent API

Status: Complete

Implemented:

- Fastify catalog, description, artifact, run, and verification endpoints
- asynchronous operation snapshots and ordered lifecycle events
- polling and server-sent event access
- loopback host/origin enforcement, body limits, and browser security headers

## Phase 27 — Visual Agent Console

Status: Complete foundation

Implemented:

- React and Vite local console
- platform health, lifecycle overview, and agent catalog
- manifest, permission, workflow, dataset, and schema inspection
- guided schema-derived input plus raw JSON mode
- run and verification lifecycle traces
- filtered evidence inventory and deliberate raw-artifact disclosure

## Phase 28 — Agent Authoring Scaffold

Status: Complete foundation

Implemented:

- validated kebab-case agent IDs
- no-overwrite generation of agent, dataset, test, and README files
- experimental manifest, typed contracts, executor, assessment, and smoke case
- explicit registration retained as a reviewed source-code step

## Phase 29 — Web Console Verification and Hardening

Status: Complete foundation

Implemented:

- component tests for the visual catalog
- injected HTTP tests for read-only, run, persistence, and origin boundaries
- full TypeScript checking for server and browser projects
- production build and local server smoke verification
- dependency audit with no known vulnerabilities

## Current Priorities

1. Use the console to inspect and run both existing agents.
2. Scaffold one learning agent around a practical personal workflow.
3. Convert observed failures into versioned dataset cases.
4. Add browser end-to-end coverage only after the interaction surface changes.
5. Introduce a database, authentication, or remote deployment only when a
   concrete operating requirement justifies those boundaries.
