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
- guided schema-derived input, including one-item-per-line string arrays and
  omission of blank optional fields, plus raw JSON mode
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

## Phase 30 — Local Workspace Registry

Status: Complete foundation

Implemented:

- versioned filesystem-backed workspace registration
- built-in workbench workspace plus add, list, resolve, and remove operations
- CLI and web workspace management
- workspace-scoped tool construction and artifact identity

## Phase 31 — Bounded File Inventory

Status: Complete foundation

Implemented:

- deterministic repository file inventory without reading file contents
- extension, file-count, depth, permission, symlink, and output limits
- platform tool registration and visible tool contracts in the console

## Phase 32 — Documentation Auditor

Status: Complete foundation

Implemented:

- reusable read-only documentation audit agent
- balanced documentation and implementation context selection
- structured findings, coverage gaps, and prioritized actions
- evidence-path validation and complete persisted audit evidence

## Phase 33 — Workspace and Tool Console

Status: Complete foundation

Implemented:

- persistent workspace selection across console views
- workspace-scoped agent run and verification controls
- workspace-filtered artifact inventory
- tool catalog, schemas, descriptions, and agent-consumer visibility

## Phase 34 — Evidence Presentation and Export

Status: Complete foundation

Implemented:

- runtime-validated, provider-neutral artifact presentation contract
- specialized Documentation Auditor evidence projection with generic fallback
- visual audit metrics, findings, recommendations, actions, and coverage gaps
- execution timeline, model usage, token counts, timing, and estimated cost
- deliberate citation inspection from persisted source snapshots
- Markdown, presentation JSON, and complete raw-evidence downloads
- presentation, export, HTTP, and React component coverage

## Phase 35 — Tool Builder Proposal Agent

Status: Complete foundation

Implemented:

- experimental registered Tool Builder agent
- strict safe, clarification, and rejection dispositions
- structured tool contracts and proposed TypeScript source and test files
- separate registration guidance rather than generated registry overwrites
- deterministic generated-path and duplicate-path validation
- explicit side-effect authorization boundary
- required targeted tests and typecheck commands
- provider, refusal, failure, policy, timing, and complete proposal evidence
- safe, incomplete, and unsafe versioned smoke cases
- web-console discovery through the existing agent catalog
- operator-facing example input and CLI command

Deferred deliberately:

- writing proposed files
- dependency installation
- compiling or executing generated code
- automatic registry modification
- approval and rollback workflow

## Phase 36 — First Accepted Tool Implementation

Status: Complete foundation

Implemented:

- accepted `dependency-version-auditor` proposal converted into reviewed code
- workspace-root injection rather than caller-selected permission roots
- package-manifest-only recursive discovery with denied-directory and symlink
  exclusion
- deterministic file-count, byte-count, and depth limits
- dependency, development, peer, and optional dependency comparison
- stable version, declaration, section, and path ordering
- explicit malformed JSON, dependency metadata, and UTF-8 evidence
- traversal, malformed-manifest, symlink, truncation, and registration tests
- platform registry integration and automatic Tools-page contract discovery

## Phase 37 — Evaluation Studio

Status: Complete foundation

Implemented:

- runtime-validated immutable evaluation experiment artifacts
- compact references to complete dataset evidence without raw-evidence copying
- frozen agent version, workspace, model, repetitions, and concurrency
- aggregate reliability, dataset case grids, and repeated-trial inspection
- trial-level input, output, assessment, failure, and timing evidence
- evaluation history filtered by workspace and agent
- aligned baseline-versus-candidate case comparison with explicit improved,
  regressed, unchanged, and insufficient-evidence states
- downloadable dataset-case drafts for reviewed regression promotion
- application-service, HTTP API, presentation, persistence, and React coverage

Deferred deliberately:

- browser-side mutation of versioned datasets
- collaborative annotations and approvals
- production telemetry ingestion
- remote artifact storage and authentication

## Phase 38 — Controlled Verification Command

Status: Complete foundation

Implemented:

- fixed typecheck, full-test, and targeted-test command identifiers
- application-owned npm executable and argument construction
- no caller-selected shell, executable, working directory, environment, or
  arbitrary arguments
- canonical existing TypeScript test-file validation within the workspace
- traversal, symbolic-link escape, denied-path, and non-test-file rejection
- fixed timeout and bounded combined stdout/stderr capture
- explicit exit code, signal, truncation, environment, and pass evidence
- nonzero test outcomes separated from tool-execution failures
- restricted inherited environment excluding workbench API credentials
- platform registry, Tools-page discovery, direct CLI, and adversarial tests

Deferred deliberately:

- arbitrary shell execution
- caller-defined project scripts or arguments
- Playwright-specific command profiles
- operating-system or container isolation
- write-capable patch application

## Phase 39 — Playwright Failure Triage Agent

Status: Complete foundation

Implemented:

- strict sanitized Playwright failure, attachment-metadata, and diagnosis
  contracts
- bounded repository reads selected from explicit failure input
- optional fixed targeted-test verification through the controlled command tool
- explicit untrusted-data prompt boundaries for logs, stacks, files, and command
  output
- deterministic rejection of invented repository and verification citations
- complete read, command, provider, refusal, failure, citation, and timing
  evidence
- hidden dataset expectations kept outside model input
- case-specific deterministic assessment separated from runtime success
- expectation and assessment drill-down in Evaluation Studio
- three representative test-defect, application-defect, and environment cases
- registered experimental agent, workflow, dataset, and specialized run
  presentation

Deferred deliberately:

- Playwright trace, HTML report, screenshot, and video parsing
- automatic reruns or arbitrary Playwright command construction
- source edits and patch application
- unsanitized production failure ingestion
- statistical claims from the small smoke dataset

## Phase 40 — Evidence-Driven Agent Improvement

Status: Complete foundation — executable improvement loop and engineering handoffs

Goal:

Enable any eligible registered agent to turn saved evaluation failures into a
reviewable improvement proposal, construct a candidate only through an explicit
agent-owned revision schema, compare baseline and candidate under frozen
conditions, and record a human-controlled promotion decision.

Delivery:

1. **Complete:** Read-only Agent Improvement Analyst with bounded evidence
   packets, strict cited proposals, cross-agent synthetic evaluation cases,
   immutable persistence, and Evaluation Studio presentation.
2. **Complete:** Opt-in agent revision surfaces and a Documentation Auditor
   pilot exposing instruction and context policy only, with validated in-memory
   candidate construction.
3. **Complete:** Evaluation-only candidate identity, effective-policy digests,
   proposal-patch merging, and ephemeral candidate execution without source
   mutation.
4. **Complete:** Development, regression, and protected dataset purposes with
   protected evidence withheld from the optimizer.
5. **Complete:** Frozen execution, immutable comparison evidence, and
   deterministic completeness, scope, regression, protected, improvement,
   latency, and cost gates.
6. **Complete:** Immutable approve, reject, or revise decision artifacts, plus
   application-service and Evaluation Studio recording against saved candidate
   comparisons. Approval still emits only a source-controlled release task.
7. **Complete:** Candidate-ready proposal execution through the subject-owned
   revision surface, frozen baseline/candidate runs, immutable comparison,
   promotion gates, and the operator decision page.
8. **Complete:** Operator-triggered Tool Builder handoff for policy-valid
   tool-capability recommendations, preserving proposal lineage in a normal
   read-only Tool Builder run.
9. **Complete:** Operator-triggered Change Risk Reviewer handoff over the real
   bounded workspace diff, with proposal and optional Tool Builder lineage.
10. **Complete:** Live general-agent validation across Documentation Auditor,
    Tool Builder, Change Risk Reviewer, Repository Assistant, and Improvement
    Analyst. Explicit routing guidance raised the Analyst hidden-case result
    from 1/5 to 5/5; Playwright remains deliberately deferred.

Required safeguards:

- the subject agent and optimizer cannot establish their own ground truth
- candidate behavior cannot change graders or datasets in the same experiment
- tool and permission expansion cannot occur through a policy candidate
- protected cases cannot be inspected by the optimizer
- promotion never occurs from one unreviewed model recommendation
- released semantic versions remain source-controlled

Detailed design:

- [`docs/agent-improvement-loop.md`](agent-improvement-loop.md)

Deferred deliberately:

- unrestricted source-code generation or self-editing
- automatic tool, permission, evaluator, or dataset mutation
- model fine-tuning
- automatic semantic-version release
- Jenkins- or Playwright-specific improvement architecture
- production feedback ingestion before the local loop is proven

## Phase 41 — Portable Agent Delivery

Status: Planned

Goal:

Make the private Workbench reproducible on another approved laptop while
delivering proven agents independently of the Workbench for interactive use.

Delivery:

1. **Local path complete; fresh-clone verification pending:** Clean-clone setup
   and offline health check covering runtime, lockfile, local-data exclusions,
   typecheck, tests, web build, and agent catalog. Server startup, workspace
   registration, and live provider access remain machine-specific acceptance.
2. Machine-local workspace registry and run evidence with explicit exclusions
   for credentials, employer repositories, datasets, and artifacts.
3. Acceptance checks using existing registered agents against a sanitized
   project before connecting an employer-controlled repository.
4. A canonical agent export contract followed by runner-specific packaging for
   Claude Code, Cursor, and Codex without requiring the Workbench at runtime.
5. Workbench runner use for reviewed CI integrations such as Jenkins or GitHub
   Actions after interactive agent behavior is proven.
6. Playwright Failure Triage validation against reviewed real failures as the
   final agent milestone, after a controlled failure set exists.

Detailed boundary:

- [`docs/portable-agent-delivery.md`](portable-agent-delivery.md)

Progress (2026-08-04): the canonical export contract and the first Claude Code
adapter shipped; `project-intake@0.3.0` completed the full round trip (export,
real interview in Claude Code, provenance-verified feedback import, packaging
fix, re-export). The Cursor and Codex adapters and CI-runner integration
remain planned.

## Phase 42 — IDE Connection via MCP

Status: In progress (Decision 084 accepted; iterations one and two shipped)

Goal:

Connect IDE sessions (Claude Code, Cursor) to the Workbench through an MCP
server over the existing loopback application service, so evidence flows both
ways without opening a policy side door. On the Workbench machine, MCP is the
primary agent channel; exported packages remain the distribution channel for
environments without the Workbench.

Permission model (fixed by Decision 084):

- read everything (catalog, evidence, evaluations, gates, decisions)
- write evidence freely (submit feedback bundles, run agents, run gates,
  start improvement analyses)
- write promotion decisions only with explicit operator identity and rationale
- never write policy or source; releases remain the only behavior-change path

Delivery:

1. **Shipped (iteration one):** stdio MCP server (`npm run mcp`, `.mcp.json`)
   with catalog and artifact reads, provenance-verified feedback-bundle
   submission, and approved-export package delivery.
2. **Shipped (iteration two):** `run_agent` on the measured model with full
   run evidence; `intake_start`/`intake_turn`/`intake_status` driving
   evidence-grade interviews through the controller; operator-attributed
   `record_brief_decision` and `record_promotion_decision` under the same
   constraints as the CLI and web boundaries. Stale installed skill copies
   retired in favor of fetch-on-demand delivery.
3. Gate runs and improvement-analysis starts with operation polling over MCP.
4. Feedback-verification lineage policy: decide whether bundles may verify
   against an export's approved lineage rather than only the exact exportId.
5. Registration guidance for Cursor, keeping the server loopback-only and
   credentials machine-local.

Deferred deliberately:

- any prompt or policy synchronization between IDE and Workbench
- remote or multi-user access; the server remains loopback-only
- streaming Builder-stage evidence (designed later with the Foundry Builder)

## Phase 43 — Foundry Build Pipeline (Decision 085)

Status: Complete (2026-08-05)

Goal:

Turn approved capability plans into merged, verified code through governed
external builder sessions, with independence enforced by structure rather
than convention.

Delivery:

1. Test Designer agent: approved acceptance plan → executable acceptance
   tests (visible set plus protected holdout subset), authored without
   sight of any implementation; gated like every other foundry agent.
   Shipped: suite 3ffe688e approved after two evidence-driven revision
   rounds.
2. Slice work orders: deterministic per-slice assembly from the approved
   chain (digest-pinned suite, dependency gate on approved submissions,
   applicable-files rule over due criteria). Shipped in slice 15.
3. Slice submission verification: byte-exact scope check of
   acceptance-tests/, Workbench-run applicable visible and holdout files
   through the controlled runner (holdouts materialized only for the run),
   digest-pinned submission evidence, and a per-slice operator merge
   decision. Advisory Change Risk Reviewer input deferred. Shipped in
   slice 15.
4. First live build: the habit tracker built across six governed slices by
   an external Claude Code builder session (Decision 085 roles). All six
   submissions passed; the never-disclosed holdout file passed on first
   exposure at slice 6. Working CLI on generated-project main with per-slice
   merge lineage citing submission and decision ids.

Known limitation carried forward: the builder session shared a machine and
user with the Workbench store, so holdout secrecy relied on disclosed
restraint plus deterministic checks; true isolation needs a builder session
scoped to the project directory only.

## Current Priorities

Progress 2026-08-07: intake cycles #1 and #2 complete (0.5.0 released —
interview closure rule, then unprompted in-place rewrite of
self-referential acceptance criteria; both patches gate-proven with the
full decision chain pinned). Console gaps from priority 2 fixed (mapping
test types surfaced with manual flagged red; success notices on decisions
and work orders; operator-guidance field on failure analysis). Reconciler
backstop blocks self-referential criteria at runtime. Remaining, in
order, each with its plan:

1. Proposal-time candidate patch validation. The analyst produced a
   321-character instruction line; the policy check passed it and the
   failure surfaced as a raw schema error when the operator clicked
   Run frozen comparison. Plan: where the improvement pipeline runs its
   citation/candidate policy evaluation, additionally apply the
   candidatePolicyPatch to the baseline policy and parse the result with
   the subject agent's policy schema; any Zod issue becomes a policy
   issue ("candidate patch produces an invalid policy: ...") so the
   proposal records succeeded=false with a legible reason and the
   comparison button never sees an invalid patch. Unit test: a patch
   with a >300-char instruction line yields a failed policy evaluation
   naming the line. No UI change needed — the proposal page already
   renders policy issues.

2. Architect improvement loop (all-manual acceptance mappings, observed
   twice: habit tracker and Mac Librarian plan 22969605). Plan: add a
   hidden expectation check to the architect dataset (forbid mappings
   whose testType is "manual" when the criterion's verification
   describes behavior an automated test can exercise — start simple:
   maximum manual-mapping ratio, enumerable and deterministic), plus a
   dataset case whose input brief mirrors the Mac Librarian criteria
   and whose expectation requires zero manual mappings. Then the
   operator drives the standard loop: baseline (expect the case to
   fail), analyst with steering guidance, frozen comparison, gates,
   promotion, source release. Watch for the same over-broad-rule
   regression pattern intake cycle #2 hit.

3. Test-designer verification dataset (prerequisite for its loop).
   Plan: scripted-provider dataset in the established rhythm — cases
   built from the two recorded live defects: (a) document-auditing
   suite (input: approved chain artifacts; hidden expectation: every
   generated test file spawns the product under test, no file reads
   brief/plan artifacts — deterministic string checks on file content),
   (b) missing holdout (expectation: exactly one holdout file while
   visible files still cover every automated mapping), (c) regression
   guards for the known-good suite shape (criterion coverage, syntax
   validity via esbuild). Register the dataset on the test-designer
   manifest with minimumPassRate 1; then the loop is available when
   evidence warrants.

4. Project-evolution loop — PROVEN LIVE 2026-08-07: Mac Librarian
   generation 2 closed (completion fa2722cb, brief v11, suite 07e57ada,
   7 slices — 4 carried + 3 delta, both holdouts green at main
   add84ae). The operator drove the whole round from the console:
   reopen → v2 requirements (intake 0.5.0 rewrote the old document
   criteria behaviorally, unprompted) → evolution plan (built slices
   byte-identical, dispositions computed) → capability → successor
   suite (delta-only model output, Workbench merges carried files) →
   three delta builds by an isolated builder on the existing repo, all
   descent-checked, all passing both holdouts first exposure → live
   completion. Six defects found and fixed during the run (nullable
   schema field, capability planner flake, designer echo starvation →
   delta-only redesign, builder-channel git inspector, carried slices
   in the build view and completion gate). Implementation record:
   slices A–F, commits b88aa82..b46478f; 943 tests green.
   Original design record — DESIGN SETTLED 2026-08-07 as Decision 088
   (generations closed by build-completion records, grown by the same
   gates; adversarial probe killed three fatal draft flaws — holdout
   leakage via retention rules, criterion-id churn, unpinned git
   state). Implementation slices, in order, each through the usual
   slice rhythm:
   A. build-completion artifact + service (green full-suite re-run,
      commit SHA + tree digest pins, built-slice enumeration, redacted
      holdout evidence, retroactive mode) + CLI/MCP/console surfaces.
   B. Brief reopening: reopen decision kind closing downstream gates;
      session-scoped turn budget counted from the reopen decision;
      deterministic criterion-id carry contract (verbatim or declared
      retirement) enforced at brief persistence.
   C. Evolution plan: architect input carries prior approved plan +
      completion record; Workbench-computed slice dispositions
      (carried requires membership in the completion's built set AND
      content identity with the prior plan); model never authors the
      flag.
   D. Evolution suite: designer input carries prior suite including
      holdout content + requiredHoldoutCount (prior + 1); per-file
      lineage declarations (carried|revised|new|retired + prior
      digest) with deterministic succession validation and one-way
      disclosure.
   E. Delta work orders + submissions: carried slices satisfy
      dependency gates from the pinned completion; carried criteria
      always due (structural regression); commit/tree-digest pins with
      descent check at submitSlice; evolution workspace prep (clone at
      pinned commit, reconcile acceptance-tests/ as a Workbench
      commit, modify-existing-codebase builder instructions).
   F. Console: completion panel, reopen flow, criterion diff at brief
      approval, generation demarcation in the chain view.
   Proving run: retroactive completion for mac-librarian → reopen →
   v2 requirements (app-data/project-directory skip, review queue
   capped at human scale, content-based grouping) → full chain →
   isolated builder → first evolved release.

JOB APPLICATION TRACKER GENERATION 1 SHIPPED 2026-08-09 under the
recorded delegation (completion 428ff199, suite 72ef5976, five slices
verified out-of-tree, field-trialed immediately with a real scenario
and judged usable — field report 4b4dbd21). First product to meet the
operator's usable-software bar. Defects fixed en route: designer
baseline prompt lacked the enumerated coverage checklist (backported,
0.3.0); designer model under-provisioned (switched to gpt-5.4 per
Decision 086 evidence); suite week-arithmetic error caught by the
BUILDER through ask_operator and fixed by surgical revision. Queued
from this run: null-implementation gate for suites (substance check —
a candidate suite must fail a stub program or be rejected); decision
forms must name their target artifact; tilde-expansion on path inputs;
builder sandbox currently denies git init; next should announce
valid-but-empty results.

WORKBENCH QUEUE SHIPPED 2026-08-09 (evening, under standing
delegation; commits f4437c4..bc74db9, 976 tests): (1) NULL-
IMPLEMENTATION GATE — every generated test file runs against a stub
project at design time; a file that passes there is vacuous and the
suite is rejected by name (closes the placebo class for any model).
(2) Deterministic intake repeat-question guard — near-verbatim re-asks
are filtered before reaching the operator and recorded on the turn
(filteredDuplicateQuestions); circling can no longer hold an interview
open. (3) Hygiene: decision forms name their target artifact; operator
path inputs trim + expand ~ at the web boundary; builder workspaces
arrive with git initialized (sandbox denies builder-side init). Earlier
same day: test-designer 0.3.0 (enumerated coverage checklist, gpt-5.4)
and project-intake 0.6.0 (gpt-5.4) — model tiering by evidence.

NORTH ROADMAP SET 2026-08-09 (late-night design session with the
operator; conversation-only, nothing below started):
0. DONE 2026-08-09 — Hermes research memo at docs/research/
   hermes-agent-memo.md (6-angle sweep + source-level follow-ups).
   Verdicts: phase 3 is WIRING (full MCP client; our CLIs integrate as
   MCP servers); phase 4 is FEASIBLE without forking (write_approval
   staging + fail-closed pre_tool_call hooks + pending-queue
   consumption; approve path is the fragile joint); trust surface is
   SIGNIFICANT (containment prescription in memo is a precondition);
   adoption real (~228k stars); the self-written-skill problem is
   documented, unsolved, and upstream is converging on exactly our
   pattern (PR #80820, issue #416) — upstream contribution is the
   high-visibility play.
1. DONE 2026-08-10 — Tracker generation 3 closed (completion 37ab85e4,
   suite 612592e0, main bf2e749, field report 6470c6d5): --json on all
   read commands with null-normalized keys, write-command rejection,
   field-verified on the operator's real store. Round notes: FOURTH
   designer calendar-arithmetic defect caught pre-approval (surgical
   revision); platform candidate logged — deterministic date-math
   validation of designer fixtures. 16k contract cap proved out (6.7k
   contract intact). Driving guides updated (tracker --json; drill
   --tag flag + global-flag ordering corrected).
2. DONE 2026-08-10 — Showroom generation 1 closed (completion e32041e9,
   suite 27442557, main 7508d36, field report 4e9a94ae): one local
   dual-panel page over both product CLIs, write actions through
   `update --contact --note` and `grade`, product empty/confirmation
   lines rendered verbatim, stderr error boxes at HTTP 200, fail-closed
   startup without store env. Field-verified on the real stores (all 5
   real follow-ups, both at-risk badges, honest empty drill panel).
   First browser-product round; web-verification conventions held with
   zero verification-machinery changes. Round cost: THREE suite
   revisions caught pre-build by verification-before-approval — (a)
   fixture CLIs spoke a private protocol the real products don't
   ({rows,emptyLine}, no --store; a green server would have written to
   the operator's real default stores), (b) Playwright-test matchers
   under vitest ('Invalid Chai property: toBeVisible' — unsatisfiable),
   (c) grade-flow missing SHOWROOM_NOW (disappearance assertions
   unsatisfiable) + holdout-only confirmation copy. One premature suite
   approve by the delegated operator, self-caught and reversed on
   record (decision ca683e52). Platform changes: test-file content cap
   20k->64k (commit 328decc; third instance of the maxLength-truncation
   class — designer emissions failed syntax gates at exactly the cap).
   Platform candidates logged: (i) empty-applicable slice submissions
   report bare "passed" — vacuous runs must be visibly marked; (ii)
   single-file suite granularity x every-criterion-due applicability
   means interim slices verify nothing until the last — consider
   any-due semantics or per-slice file mandates; (iii) fixture-reality
   contract validation — when a brief references another foundry
   product, feed the designer that product's pinned interface contract.
   NOTE: the operator console predates the cap raise; it cannot load
   post-20k suite artifacts until its next restart (round was driven
   via the foundry CLI plus a same-code side-port instance for
   token-authenticated decisions, recorded in each decision rationale).
   Naming settled: Workbench makes, Foundry builds, Showroom shows.
3. DONE 2026-08-11 — Hermes phase 1 (containment proven live + clean
   tool path). ~/Projects/generated/career-mcp: MCP server, 14 tools
   over both product CLIs (validation + stores stay with the CLIs;
   deck/JD content travels as arguments, never paths; no clock
   injection), plus the containment bridge — host.js loopback listener
   under the operator account, shim.js as the ONLY file the hermes user
   runs. 6/6 acceptance tests incl. the full stdio→shim→TCP→host→server
   path. OPERATOR ADMIN DONE: dedicated `hermes` user (uid 502), home
   chmod 700, /Users/Shared/hermes drop (shim + deny hook + copied node
   binary), hermes-agent 0.19.0 installed under that account. STEP-7
   PROBES PASSED LIVE: (A) file boundary — agent searched for career
   data, got nothing, /Users/lazy_genius unreachable; (B) skill
   governance — skill_manage staged to ~/.hermes/pending/skills/, live
   skills dir empty; (C) BYPASS BLOCKED — direct write_file to the
   skills dir denied (the #60440 path that succeeded pre-hardening),
   deny-hook reason echoed back; (D) data path — agent reached real
   answers ONLY through the MCP server → CLIs → validation. Skills dir
   hardened root:wheel + `chflags schg` so no hermes-process write
   survives even if the fail-OPEN shell hook (0.19.0 has no fail_closed
   for shell hooks) misses. KEY FINDING: the agent is a capable
   localhost network client (when tools were briefly absent it read the
   port from shim.js and hand-rolled a raw socket) — containment must
   NOT rely on network isolation; it rests on OS file perms + every
   localhost service requiring auth (the console's operator token).
   ROOT-CAUSE dug from 0.19.0 source (no sudo needed): career tools
   first failed to surface because `pip install hermes-agent` ships
   WITHOUT the `mcp` Python SDK — the bare install has no MCP client;
   `hermes mcp test` named it; fix is `pip install 'hermes-agent[mcp]'`.
   Also learned from source: direct-OpenAI provider is registry id
   `openai-api` (reads OPENAI_API_KEY, honors OPENAI_BASE_URL); model
   block is `model:{provider,model}`; MCP config key `mcp_servers`;
   context files SOUL.md/.hermes.md/AGENTS.md/CLAUDE.md auto-inject from
   HERMES_HOME. LIVE ON REAL STORES now (~/.job-tracker/applications.json,
   ~/.interview-drill/cards.json — verified no test-write leakage);
   host runs via `npm run host` in a terminal tab (dies with the
   session — LaunchAgent is optional polish). Guide hermes-kit/
   hermes-home.md → ~/.hermes/.hermes.md names the mcp__career__* tools.
   Setup doc updated to mandate the [mcp] extra. Deferred at operator's
   pace: dedicated API key (on main OPENAI key for now, "fix later").
   FIELD GUIDE published (artifact): terminology + two diagrams (foundry
   chain, two-planes/containment wall) + "say it out loud" — the
   operator's training/explaining reference; stable picture only, the
   request-channel is deliberately excluded until it exists.
4. DONE 2026-08-11 — PROFILE TOOL (career-profile) SHIPPED through the full
   foundry chain under the "start building" delegation. Completion d66e11c1,
   suite 315485cf, main 0327c11, field report ec37a354, at
   ~/Projects/generated/career-profile. Chain: brief dcc7cf57 v8 (6 intake
   turns → 30 tester-verifiable criteria, approved 14c278d0) → architecture
   3d4f70c9 (10 components, 6 slices, all 30 mappings AUTOMATED, approved
   50a308ea) → capability 921661f6 (approved b98b44bf) → suite 315485cf (ONE
   revise 9bca713e that caught 4 real defects operator-review-only: hedged
   stdin-write assertions, a store-corrupting id-rewrite .map(), a shallow
   faithfulness check, and FAKE docx/pdf fixtures forcing a fake extractor —
   fixed with operator-generated REAL base64 fixtures verified pdfjs-extractable;
   approved 563e049e) → 6 slices built by the delegated builder → completion
   re-ran all 4 visible files + the holdout out-of-tree, exit 0, at 0327c11.
   Faithfulness-by-construction implemented and verified. Real text extraction
   (fflate docx, pdfjs PDF). Field-checked end-to-end on the real binary.
   Honest deviation on record (field report): --min-coverage gates on RAW
   represented/total (as the suite encodes), not the exclude-honest-gaps model
   described verbally in design; the executable contract won. Process artifact:
   6 redundant scope-only slice-1 submissions from a first approval-loop bug
   (one approved). ORIGINAL DESIGN (still accurate):
   Profile tool jumps the queue on LIVE DEMAND: operator
   is actively fielding recruiter correspondence and hand-generating
   JD-tailored resumes; time to standardize). Jumps the queue ahead of
   the trace analyzer because it has pressing real demand + a clean
   deterministic core, whereas the analyzer is gated on sourcing a trace
   dataset. ONE product, not two — the resume generator owns NO data of
   its own, it's pure function over the profile store, so it's a
   read-side subcommand, not a separate tool (the decision rule: a tool
   that owns no store and is pure function over another's store is a
   subcommand). Owns a STRUCTURED skills/profile store (CRUD; skills with
   attributes — name, category, proficiency, evidence/where-demonstrated,
   last-used). This is where ~/.job-tracker/profile.md graduates from a
   flat doc to a validated store, and where the earlier resume→profile
   thread lands (agent PROPOSES skills extracted from the resume, the
   tool validates + applies; profile stays operator-disposed). SHARED
   INFRA confirmed: tracker tailors applications from it, drill targets
   weak skills from it, resume generates from it — three consumers = its
   own home, NOT a Job Tracker feature (domain mismatch: tracker owns
   applications, profile owns the person). `resume` read-side subcommand:
   base / from-profile / JD-tailored = ONE command parameterized by input
   (JD tailoring composes with the tracker's existing --jd attachments —
   agent is the bus). THE ACCEPTANCE INSIGHT (the eval story, on-brand
   for the operator's Skript role): cannot gate "is the resume good"
   (subjective — the host model's job at use-time), but CAN gate
   FAITHFULNESS (every claim traces to a real profile entry — no
   fabricated skills/jobs; checkable BY CONSTRUCTION if the assembler
   renders from structured selection emitting source ids), JD-keyword
   COVERAGE, and FORMAT validity. That faithfulness gate is the
   platform's hollow/fraudulent-output catch pointed at resumes. Chain:
   deterministic core (store CRUD + JD matching/selection + assembly/
   templating) is fully foundry-buildable (null gate + holdout); the
   wordsmithing stays OUTSIDE as an agent driving-guide (generative,
   uncertified by design — like every product's CLAUDE.md). SCOPE
   DECISIONS before intake: skill-store schema/attributes; output formats
   (markdown/plaintext first? PDF is a renderer stretch — likely later);
   how skills seed (agent-from-resume vs manual entry). First move =
   intake→brief. NOT started — operator has an interview 2026-08-11 and
   is not coding today; DIRECTION LOCKED, build when ready.
   EXPANDED PLAN (2026-08-11): docs/plans/profile-tool.md — synthesized from a
   7-facet design panel + completeness critic (ultracode workflow). Core thesis
   unanimous: FAITHFULNESS-BY-CONSTRUCTION (render unit == store record == stable
   id; no free-text render path). Panel surfaced 13 substrate contradictions, now
   RECONCILED in the doc: store = tracker's model (kind-discriminated record array,
   materialized head + append-only timeline, stable uuid = faithfulness anchor);
   taxonomy includes a first-class `summary` entity; selection via named `variant`
   records; coverage = present-but-unselected(hard) vs missing-from-store(note),
   soft default; faithfulness = BYTE-EQUALITY (fuzzy verify dropped); ingestion = a
   subcommand, v1 txt/md/html/docx (PDF deferred — non-deterministic, flakes the
   coverage gate); transform whitelist pinned (= the gate spec); dates YYYY-MM;
   migration dry-run via read command `import-plan --json`. SHARPEST CATCH: every
   faithfulness test MUST be conjunctive (assert real claims present AND
   fabrications absent) or it passes vacuously against the empty stub and the null
   gate rejects it — a new test-authoring rule for the designer. Store name
   `career-profile` at ~/.career-profile/profile.json. Build order: store →
   assembler+gates → ingestion → migration → guide.
5. QUEUED (behind the profile tool by live demand; still gated on the
   operator sourcing a trace dataset) — SKILL FOUNDRY, first real
   instance: a Playwright trace-artifact
   analyzer, built through the normal chain and EXPORTED as a Claude Code
   skill (2026-08-11, operator wants "the real thing"). This is the
   phase-2 thesis made concrete outside the job-search products: the
   workbench certifying importable agent-skills for any coding harness.
   REFRAME that makes it fit: build as a workbench AGENT gated by a trace
   dataset, then `export-claude-code` it as a SKILL.md — reuses the
   existing agent-eval harness + export lifecycle; the platform wrapper
   is the last swappable step (Claude Code now; Cursor/others later).
   EXISTING playwrightFailureTriage agent is a PARTIAL seed only: it
   triages error TEXT (message/stack/attachment metadata) into a 7-cat
   taxonomy with schema {classification,confidence,evidence,
   needsMoreEvidence}, dataset ~3 cases — WRONG MODALITY (never cracks
   the trace.zip) and too thin. Salvage taxonomy + output schema +
   labels, then supersede it. LOAD-BEARING PREREQUISITE (the whole
   ballgame): a corpus of real labeled trace.zip artifacts (~15-30,
   spread across the taxonomy, visible + holdout) — the operator's SDET
   work is the irreplaceable input; without it the "governed" build is
   theater. Deliverable shape: EXTRACTOR (deterministic script: trace.zip
   → structured JSON of timeline/failing-step/network/console/snapshots;
   null gate applies normally) + INSTRUCTIONS + SCHEMA (the skill's
   intelligence is the HOST harness's model at use-time; the foundry
   certifies the scaffold, not a model it runs). Chain: 0 seed+scope →
   1 intake/brief (input raw-zip vs pre-extracted; output; taxonomy;
   non-goals: doesn't fix the test, doesn't re-run the browser) →
   2 dataset assembly (visible+holdout) → 3 arch+capability plan →
   4 acceptance suite (deterministic extractor tests + null gate, PLUS
   held-out-trace eval pass-rate = the certification) → 5 build
   (extractor via isolated builder; instructions via improvement loop) →
   6 verify → 7 completion → export SKILL.md into the operator's
   Playwright project's .claude/skills/. OPERATOR DECISIONS before intake:
   taxonomy (reuse the 7?), input shape, and WHERE the trace corpus comes
   from + who labels it (gates everything). RISKS: dataset is the entire
   foundation and only the operator can source it well; prose instructions
   resist unit-testing (mitigated by the dataset eval, not eliminated);
   first foundry deliverable that's a SKILL not a CLI — expect to pave a
   little path at export. Offered next step: scaffold the extractor + a
   labeling harness so dropping in real traces is easy (operator to say go).
6. HORIZON — full skill foundry / Hermes phase 2: external agents'
   self-written skills routed through the pipeline (intake → blind
   suites → null gate → versioned gated release), and Hermes filing
   governed IMPROVEMENT REQUESTS into the workbench (agent proposes,
   gates + operator dispose; never builder, never approver). Gated on
   accumulated real-use evidence (use Hermes first) + a design round.
   Decision recorded 2026-08-11: NOT designing the Hermes→workbench
   request channel yet — it would be ahead of evidence; run Hermes on
   the real job search first and let observed friction specify it.
7. IN PROGRESS (slice 1 shipped 2026-08-11) — MODEL COMPARISON EVAL: a first-class
   cross-model evaluation capability.
   Run a SCORED task across a SET of models and output pass-rate + cost +
   latency per model — an evidence-backed "tested on gpt-5.4-mini ✓ / full
   ✓✓ / …" badge — so model selection is measured, not guessed. WHY it's
   on-thesis: model selection is the universal AI question almost nobody
   answers rigorously; a workbench that produces an evidence-backed model
   modelComparison for a task IS the eval story (and a strong pitch/portfolio piece).
   It generalizes what the foundry already does AD HOC — "model tiering by
   evidence" (intake/architect/test-designer promoted mini→gpt-5.4 after
   counted failures) — into a systematic capability. MECHANISM MOSTLY
   EXISTS: agents carry a model param; datasets + assessors + experiments
   (baseline-vs-candidate, repetitions, pass rate) exist; run evidence
   already captures tokens/latency. NEW WORK: (a) a MODEL AXIS on
   experiments (loop a set of models over one agent+dataset, aggregate);
   (b) a modelComparison/badge report; (c) an OPENROUTER provider adapter to widen
   the model set (OpenAI-compatible, so tractable — base_url + key + model
   mapping). HONEST CAVEATS: the model comparison eval is CHEAP once a scored task
   exists — the expensive part is always defining the scored task
   (dataset + assessor), so this shines for agents that have datasets and
   needs a task defined for anything else (a product behavior, an external
   agent like Hermes). And structured-output/tool-calling support varies
   across OpenRouter models — the modelComparison would EXPOSE which models can even
   play the foundry's strict-JSON game (a useful result, not a bug).
   Directly serves the immediate need too: turns "mini thrashed on the mock
   interview" into a measured badge. RANK: arguably above step 5 as a
   pitch/eval piece; gated only on prioritization.
   SLICE 1 SHIPPED 2026-08-11: the model axis on the AGENT verify path —
   `agents modelComparison <agent> --models a,b,c` (npm run modelComparison) loops
   AgentApplicationService.verify() once per model and rolls up pass-rate +
   total tokens + est. cost + avg latency per model into a persisted,
   schema-validated modelComparison artifact (runs/model-comparison-<id>.json); each cell
   links its per-model evaluation artifact for lineage. CORRECTION to the
   original "first move" note: the "existing experiment harness"
   (runScenarioDatasetExperiment) only serves harness-ROLE datasets;
   project-intake/architect are AGENTS on a separate runner, so the axis
   rides verify(), not the scenario path. Zero changes to
   runAgent/providers/schemas — model was already first-class end to end.
   Weak models fail GRACEFULLY (bad structured output → failed run → low
   pass-rate, not a crash), so the failure-generation engine is structural.
   New: src/agents/modelComparison/{agentModelComparison,agentModelComparisonWriter}.ts +
   tests/agentModelComparison.test.ts + `modelComparison` CLI command/script. FIRST LIVE
   BADGE (project-intake@0.6.0, 1 rep, 8 runs each): gpt-5.4 88% pass ·
   $0.2325 · 17.5s ; gpt-5.4-mini 88% pass · $0.0619 · 15.6s — mini ~3.75x
   cheaper at IDENTICAL pass-rate. DIAGNOSTIC PAYOFF: BOTH models failed the
   SAME case (contradiction-is-surfaced-not-silently-resolved) — a SHARED
   failure (even the strong model misses it) sits in the AMBIGUITY band, not
   a capability floor; the modelComparison located a real intake defect to triage.
   SLICE 2 SHIPPED 2026-08-11 (commit 2fe8de3): shareable markdown REPORT
   surface — renderModelComparisonMarkdown + `npm run model-comparison-report [--id] [--out]`
   renders any stored modelComparison into a faithful badge table (per-model gate,
   pass-rate, tokens, cost, latency) + notes (cheapest passing model / honest
   "none passed" / error cells). New: agentModelComparisonReport.ts, runModelComparisonReport.ts.
   SLICE 3a SHIPPED 2026-08-11 (commit 24e461e): the FAILURE-HARVESTING
   TRIAGE — triageModelComparison() reads a run's per-model failed cases (from the
   linked evaluation artifacts) and classifies each failing case by "did it
   pass on ANY considered model": failed-on-every-model → "ambiguity"
   (prompt/gate-hardening target, feed the improvement loop); failed-on-some,
   passed-on-≥1 → "capability-dependent" (model-selection signal, not a prompt
   bug). No model-strength ranking needed; cases keyed by (datasetId, caseId);
   single-model comparison eval flagged not-meaningful. `npm run model-comparison-triage`. New:
   agentModelComparisonTriage.ts, modelComparisonArtifacts.ts (shared loaders),
   runModelComparisonTriage.ts. PROVEN: auto-flagged the contradiction case as ambiguity
   on the live run (the by-hand finding, now systematic). Also: interviewer
   updated — 9 model-comparison cards imported into the drill (~/.interview-drill,
   36→45), drillable now via `--tag model-comparison`.
   SLICE 3b SHIPPED 2026-08-12 (commits c4041e0 + 43b41a3): AUTO-HANDOFF —
   `npm run auto-improve <agent>` wires modelComparison → triage → analyst → gated
   comparison into ONE self-running command; skips marginal cases; bakes in
   the hardened analyst request (citation + disposition-consistency + additive)
   with bounded retries; STOPS at a candidate (promotable/gate-rejected/
   analyst-failed), records NO decision. Injected analyze/evaluate → fully
   unit-tested. LIVE-PROVEN on 2 agents: intake@0.7.0 (0 ambiguity, correctly
   nothing to fix — we already shipped its fix) and architect@0.3.0 (100% pass
   both models, nothing to fix). The automation drives the loop correctly and
   conserves cost; candidate-PRODUCTION was proven by the by-hand run that
   shipped 0.7.0. Candidates appear only for genuine AMBIGUITY gaps (rare on
   hardened agents). Also landed the two supporting slices: STRUCTURAL FLOOR
   (0ed3b94, judges can't run below tier — enforced, not just a default) and
   the FLAKINESS GUARD (ed8bbd8, triage flags marginal/likely-variance cases).
   MODEL-COMPARISON ARC (step 7) is functionally COMPLETE.
   DEFERRED by operator: OpenRouter provider — needs a NEW provider class (Chat
   Completions + json_schema response_format), NOT a base_url swap, because
   OpenAIProvider is built on the Responses API.
   OPEN FOLLOW-UP (modelComparison OPTIMIZER direction, surfaced live 2026-08-12):
   architect@0.3.0 passes 100% on gpt-5.4-mini at ~3.5x lower cost + ~2x faster
   — a concrete DOWNGRADE candidate (doer on full → mini). The modelComparison's cost
   optimizer works, but a real downgrade wants broader coverage than the smoke
   suite; a downgrade decision + a "modelComparison says cheaper model holds" report row
   is a clean next slice if pursued.
   FAILURE-HARVESTING EXTENSION (operator insight 2026-08-11, aligned):
   the modelComparison is not just "pick a model" — deliberately DOWNSCALING the
   model turns the model range into a cheap FAILURE-GENERATION ENGINE that
   feeds the existing improvement loop. Two DISTINCT mechanisms: (1)
   GATE-HARDENING = mutation testing for agents: a weak model's bad output
   that a gate PASSES is a hole in the gate (needs ground truth = a scored
   task). (2) PROMPT-HARDENING = ambiguity discovery: a weak model's
   FAILURE marks where the instructions were under-specified — tighten
   until even the weak model succeeds and the prompt is robust for all
   models. Composition: model comparison eval (failure factory) + improvement loop
   (analyst → prompt candidate → gated release) = a system that hardens
   itself; weak models are the cheap fuel. TRIAGE CAVEAT: separate
   AMBIGUITY failures (prompt/gate left room — fixable, valuable) from
   CAPABILITY-FLOOR failures (model just can't reason — not fixable by
   prompting, only tells you the model is too weak = the selection use).
   Value lives in the ambiguity band. No standard name for
   "capability-descent as a failure factory"; operator may name it.

CONSOLE UX MASTERPLAN SHIPPED 2026-08-12 (commits 8fd036c, a46e527,
8e8c9d7, 4d795d1, ca1d29a, 61815fe, 619827c, 438a115; 1033 tests green) —
this CLOSES roadmap item "B. Console UX" (below) and goes well beyond its
original scope (a next-action banner). Operator's ask: the console showed
briefs/criteria as "blocks of text" with "a steep learning curve"; audience
= other AI agent engineers who'd import features or run their agent through
it; near-term = a legible + impressive screen-share the operator drives.
A four-lens cold-evaluator audit found the ROOT CAUSE: rich rigor computed
server-side then flattened to a COUNT (or dropped) at the view-model
boundary before reaching the client — so most wins were "carry the evidence
across the boundary + encode as FORM," not new verification. DESIGN
LANGUAGE (Decision 092): summary before detail; state encoded in form
(chips/color/severity); evidence as CLAIM→CHECK→RESULT (verdict first);
reserve color for meaning (green=pass/user-stated, amber=inferred/attention,
red=fail, indigo=holdout/rigor); ONE sanctioned raw-JSON escape hatch
(RawDrawer), never a default render. SHIPPED as six phases: (0) a reusable
component kit — SchemaView (contracts as field trees), JsonView (data as
key/value), RawDrawer, MetricTile (state before detail), Stepper (staged
narratives); (1) every default-render JSON wall killed, incl. the buried
hidden-expectation reveal on the eval-case page; (2) the MODEL COMPARISON EVAL brought
into the UI — a comparison table encoding the model-selection trade-off as
★ best-per-dimension chips (most reliable ≠ cheapest ≠ fastest) + failure
triage in two columns (ambiguity/capability-dependent), over 2 new read-only
routes /api/foundry/model-comparisons[/:id] on a new src/web/modelComparisonView.ts; (3)
the SELF-HARDENING LOOP brought into the UI — each cycle anchored on its
promotion decision (which links proposal + gated comparison + disposition),
rendered as a Stepper (proposal → gated comparison with every gate → operator
decision), over /api/self-hardening[/:id] on src/web/selfHardeningView.ts,
proven against the 13 real decisions (newest = the real project-intake 0.7.0
release); (4) FOUNDRY PLAN + CAPABILITY DEPTH — the audit root cause fixed at
its worst site: planner concerns now shown as TEXT (was a count approved
blind), build slices as a visible numbered sequence, capability needs as a
reuse-vs-build resolution breakdown (view-model foundryChainView.ts widened
to forward the detail, not just .length); (5) polish — grouped nav
(Build/Reliability/Catalog), cross-links between the reliability screens and
the agent catalog, and live clickable front-door count tiles (ungated,
demo-safe). Operator reviewed it live 2026-08-12: "This is a UI... I get a
lot more information... a lot easier to use and go through... no notes...
a major milestone." Both prior "demoware" proofs (model comparison eval + self-
hardening loop) are now first-class console screens, not CLI-only. Masterplan
artifact: scratchpad/console-ux-masterplan.html.

Parked: brownfield mode for the operator's test framework (blocked on
ownership/policy answer + work-intake shape); LinkedIn series (post 1
drafted at ~/.job-tracker/drafts/, unposted by choice); certification
3; Mac Librarian (pinned). Paper cut logged: drill today tag-filter
flag differs from the driving guide — reconcile guide or product at
tracker-gen-3 time.

DISCUSSION NOTE 2026-08-11 (off-the-cuff, NOT queued work): the foundry
could generate contract-verified integration TOOLS for external
test-infra products the operator's framework hooks into — e.g. Zephyr
(test management / result posting) and BrowserStack (execution grid;
they're migrating TO it). Each = a small CLI product (browserstack
fetch-artifacts, zephyr post-result), optionally wrapped as an agent
tool. Natural fit as the I/O PLUMBING around the Playwright trace
analyzer: BrowserStack fetch = how the analyzer gets traces in the new
stack, Zephyr post = where verdicts go. HONEST BOUNDARY: verifiable only
against each API's documented CONTRACT via a local mock server (the
Showroom fake-CLI convention generalized to a fake API server) — proves
the tool speaks the protocol, NOT that the live service behaves as
documented; real-API smoke with creds is an operator field step outside
the gate. This is a concrete instance of the logged "fixture-reality
contract validation" candidate. Do NOT ingest the existing framework
(brownfield is parked); its scripts + docs are the INPUT/contract, tools
are generated fresh. Open Qs if pursued: migration from-what; one job per
tool; consumer (human framework vs agent vs both); credential handling
(a containment concern if an agent ever calls them). Sequence AFTER the
analyzer core; each its own gated round. Captured so it's not lost.

INTERVIEW PREP DRILL GENERATION 1 SHIPPED 2026-08-09 (completion
340ef56e, suite 468e23fd, seven slices, field report ab91c06f) — third
product, second shipped same-day, built end to end by a healthy
external builder session with zero stalls. Round quality: two-round
interview with no repeated questions; one suite revision for file
granularity; one builder-caught designer arithmetic defect (per-tag
stats windowing) verified and surgically corrected; the builder also
caught the cross-project work-order leak (fixed: brief scoping +
superseded-suite exclusion) and raised the delegated-approvals
governance question, closed on the record in the field report. The
agent-as-integration-bus pattern is live: shared career profile at
~/.job-tracker/profile.md, driving guides on both products, mock
interviews and JD-targeted deck generation available with no product
coupling.

JOB TRACKER GENERATION 2 CLOSED 2026-08-09 (completion ee76c535,
suite 1114912a, main c4885c2, field report 64d0cbe9) under the standing
delegation. Shipped: contact-based inactivity (bookkeeping never
resets the clock — verified on the operator's real store, where the
gen-1 masking defect is gone), --jd attachments with collision-safe
<recordId>-<basename> naming, default store path, announced empty
results, --help documenting positional update, ratified ISO weeks and
stable output tokens. The round surfaced and fixed two platform
classes: silent 4k interface-contract truncation (cap raised to 16k)
and stale byte-identical carries of changed-criterion files (now
rejected deterministically; designer 0.4.0). The external builder
session stalled mid-round; the assistant completed the build under the
recorded delegation with disclosures in the field report. The builder's
two suite-defect reports were both correct; operator-side verification
initially erred on one and corrected itself on the evidence.

OPERATOR DELEGATION, 2026-08-09 (job-tracker build): after three
misfiled decisions caused by indistinguishable decision forms (UX
defect, queued), the operator explicitly delegated the remainder of the
job-tracker generation: "You do it. You do the entire thing and then
tell me how it works. When the product is done, let me know." Decisions
recorded under this delegation use operator id
claude-delegated-by-rashad and cite this instruction — delegated
authority is recorded, never impersonated (Decision 089's lesson).

OPERATOR DECLARATION, 2026-08-09: EVERY PROJECT TO DATE IS A FAILED
PROJECT. Established as the baseline fact. Habit tracker: built green,
never used, never aimed at use. Mac Librarian generations 1-3:
mechanically sound (atomic moves, rollback, stable registry),
semantically useless (fake content understanding, junk labels,
no convergence) — and generation 3 falsely certified a criterion the
operator explicitly ordered (real PDF/Word text extraction, d5e6f7a8)
by routing it to a carried slice with hollow tests. Mac Librarian is
PINNED — generation 4 is parked, not queued. The platform has delivered
zero usable software. Its governance record (forgery caught, gates
enforced, its own false certification surfaced by field evidence) does
not offset that; a foundry that has never shipped a product the
operator values is unproven where it counts. Nothing proceeds on any
project until the operator sets the next direction.

Field-trial verdicts, 2026-08-09 (generation-3 certification run):
- FIXED: changed/new criteria must be delta-owned in evolution plans
  (the gen-3 green-chain/unmet-reality hole), commit 9f79e0a.
- CRITICAL v1.1 (Decision 089): OS-level builder confinement;
  authenticated decision writes.
- HIGH v1.1: one-click builder handoff — the console must run the
  workspace prep itself; the terminal + full-UUID dance failed its
  operator ("the worst workflow"). Failed operations must persist
  visibly until acknowledged. Plan panels must render slice contents.
- OPEN AGENT-POLICY CANDIDATE (improvement loop, not direct edit):
  test designer needs a fixture-reality rule — criteria about binary
  formats (PDF/Word) cannot be verified with plain-text stand-ins.
- Generation 4 brief (Mac Librarian), written by field trial: Organized
  exclusion for real, convergence for real, text-extracted labels for
  real — now enforceable via the delta-ownership rule. Added 2026-08-08
  (operator ran the app cold): scoped runs — a root pointed at a single
  library folder (e.g. ~/Downloads) silently yields nothing because
  scan only descends into Desktop/Downloads/Documents under the given
  root; empty results must explain themselves (review printed
  {"batches": []} with no reason); grouping is degenerate in practice
  (15 batches of one file each — similarity clustering produced only
  singletons with PDF-internals labels like "obj endobj 21").

Generation 3 CLOSED 2026-08-08 (completion 2987790f, brief v13, main
358950e, operator-signed; 12 suite files including 3 holdouts green
out-of-tree). One live defect at the gate: the completion form accepted
a leading-space project root and misresolved it — fixed by trimming
path input (145ddff).

v1.2 sequence settled 2026-08-08 (debrief with operator). Order
CONFIRMED infrastructure-first by operator direction 2026-08-08 ("our
biggest problem is communication back to the workbench... we need to
go infrastructure first right now"): items 1-5 land before the
generation-4 run, which then doubles as the validation of the new
channels.

ITEMS 1-5 SHIPPED 2026-08-08 (Decision 090, commits e623d1d..89cb00b,
973 tests): operator token on decision-class routes; builder speech
(submission reports, notes, ask_operator/answer round-trip, unanswered
questions outrank all build steps); field reports on completions
injected into reopened interviews; one-paste builder handoff from the
build page + pinned failed operations + plan slice contents with
carried/delta tags; per-call workspace integrity check failing the
builder channel closed. NOTE: the operator must restart the console
(npm run web) to pick these up — the server prints the operator token
at startup, pasted once into any decision form. Remaining before gen-4:
nothing. Next: generation 4 (item 6), then the console-launched builder
decision point (item 7).
1. Authenticated decision writes — console decision routes trust a
   typed operatorId; any local process can POST a decision today. A
   console-held session token closes the forgery class on the web
   surface (completes Decision 089 beyond the CLI TTY guard).
2. Builder communication channel — the builder MCP server carries
   artifacts but not speech; the operator has been the relay. Add:
   builder report field on submit_slice (persisted, rendered with the
   submission), post_builder_note (work-order-scoped progress notes in
   the console timeline), then ask_operator (questions render as
   console answer forms, answers become artifacts the builder polls).
   All builder text rendered as builder-authored/unverified — data,
   never instructions.
3. Usage-feedback channel — field findings become evidence, not chat.
   A field-report artifact recorded against a completed generation
   (operator-authored in the console: what the shipped software did
   on real inputs, what was wrong), aggregated with standing
   advisories (priority A below), and injected into the next reopened
   interview so generation N+1's intake starts from generation N's
   reality instead of the operator's memory. Today this pathway is
   the operator pasting terminal output into a chat session.
4. One-click builder handoff (console runs workspace prep, hands one
   command) + failed operations persist until acknowledged + plan
   panel slice contents with carried/delta tags.
5. OS-level builder confinement hardening (structural, not
   scaffold-dependent).
6. Generation 4 run — operator-driven, first round with delta-ownership
   enforced from the start, the builder communication channel, and a
   brief seeded by recorded field reports (Exhibit A: the 2026-08-08
   cold run — obj-filter-2 labels, singleton batches, Organized
   reshuffling). SUCCESS BAR RESET 2026-08-09 by operator: the platform
   is proven only when the app is one the operator actually finds
   valuable on his real files — "the platform has to build an app
   that's usable." Green gates against hollow criteria count for
   nothing; gen-4's brief must encode usability as golden examples
   against real documents, and the generation is judged by the
   operator using the result, not by the completion record.
7. DECISION POINT after generation 4: console-launched builder — the
   operator's stated direction ("the builder should live in the UI").
   The console spawns the builder session itself (Agent SDK) inside
   the locked-down workspace and streams its transcript into the build
   page; the builder never shares console authority. Build it if the
   generation-4 run shows the communication channel + one-click
   handoff still leave the terminal as real friction; skip if they
   sufficed.
8. Reserved for operator certification 3: severity mis-calibration
   improvement loop (two live occurrences banked). Parallel candidate:
   test-designer fixture-reality rule via the improvement loop.

Priorities set 2026-08-07 (operator-ordered):
A. Advisory lifecycle — the concerns mechanism predicted both Mac
   Librarian production defects (naive grouping, raw-PDF analysis) as
   advisories, nine times across three agents, and each was read once
   and forgotten. Standing advisories now become project state:
   aggregated across approved artifacts of all generations, shown on
   the project page, injected into every reopened interview ("decide
   or explicitly defer each"), closed only by resolving criteria or
   operator retirement.
B. Console UX — DONE 2026-08-12, far beyond the original scope. See
   "CONSOLE UX MASTERPLAN SHIPPED 2026-08-12" above: the guided
   next-action banner (stage state machine) landed in the earlier
   legibility pass, and the full masterplan then rebuilt the console
   around a design language — evidence as form, not blocks of text —
   and brought the model comparison eval and self-hardening loop into the UI as
   first-class screens. Operator signed off live ("a major milestone").
C. Model qualification (Decision 086) — moved down by operator call.
D. Foresight agent — DECISION DEFERRED: after one full generation runs
   with the advisory lifecycle, examine the residual gaps that no
   downstream agent flagged; the foresight agent earns a design
   discussion only if that residue is real.

Completed 2026-08-07 — FIRST FULLY ISOLATED GOVERNED BUILD: Mac Librarian
(brief b1c76b2a), driven end to end by the operator from the console
(interview → brief v8 → plan ×4 with revision loops → capability plan ×2 →
test suite ×3 with revision loops → 4 build slices). Built by an isolated
Claude session in a prepared workspace over the redacted workbench-builder
MCP channel; all four submissions passed out-of-tree verification on first
exposure including the withheld holdout each time; all decisions
operator-recorded; merged to main with acceptance tests green. Three
platform defects were found and fixed live during the run (intake answer
ids, hidden zero-question intake form, and the earlier stale-openQuestions
stall pattern).
2. Capability Planner verification dataset and gate (same rhythm as intake
   and architect).
3. Evidence-backed model qualification, promoted per Decision 086: add an
   Anthropic provider so evaluation can run on the model an agent serves on.
4. Declarative agent registration via MCP as subjects under test
   (Decision 086), converting the runner into a testing service for agents
   authored anywhere.
5. Phase 42 iteration three: long-running evidence operations over MCP and
   the feedback-verification lineage decision.
6. Route imported export-feedback evidence into improvement-loop packets;
   Improvement Analyst disposition dataset from recorded live misroutes.
7. Clean-clone portability verification on the second laptop, covering all
   foundry, export, import, and MCP surfaces.
8. Exercise Playwright Failure Triage against reviewed real failures as the
   final agent validation milestone.
