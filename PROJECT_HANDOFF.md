# Agentic Engineering Workbench — Project Handoff

## Project Purpose

`agentic-engineering-workbench` is a local TypeScript platform for developing, running, evaluating, and debugging reusable AI-agent harnesses.

The project combines two ideas:

1. An Agent Reliability Lab
2. A Local AI Engineering Assistant

The goal is to learn how reliable agent systems are built around a model while creating reusable engineering infrastructure.

The Workbench is the user's private authoring, evaluation, and improvement lab.
The eventual distributable product is an approved agent, repository-native
bundle, or CI runner integration—not a requirement that another team adopt the
Workbench. Employer repositories, datasets, credentials, and run evidence must
remain in employer-controlled environments and outside this personal source
repository.

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
- an evidence-approved Documentation Auditor `1.1.1` baseline that recognizes
  AsciiDoc `.adoc` files without expanding tool permissions
- a Documentation Auditor `1.2.0` input boundary for explicit per-run path
  exclusions, preventing project-specific fixtures from consuming inventory or
  model context while preserving the selected scope in run evidence
- a registered protected Documentation Auditor dataset that participates in
  every frozen candidate comparison while remaining outside optimizer context
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
- deterministic completeness, scope, regression, protected, improvement,
  latency, and cost promotion gates
- outcome-aware latency and cost gates that do not compare failed pre-model
  runs with successful model-backed runs
- optional provider usage aggregated into agent-run evidence
- cost gate enforced from comparable estimated-cost evidence when available
- gate outcomes embedded in candidate-comparison artifacts and presentations
- immutable operator approve, reject, and revise promotion decisions
- approval-only source-controlled release tasks that never mutate the registry
- application-service and Evaluation Studio recording of promotion decisions
  against saved candidate comparisons
- candidate-ready proposal execution from its artifact page through candidate
  construction, frozen baseline/candidate evaluation, comparison persistence,
  promotion gates, and the existing operator decision boundary
- operator-triggered Tool Builder handoffs from policy-valid
  `engineering-change-required` tool-capability recommendations, with exact
  proposal/recommendation lineage and forced read-only proposal generation
- operator-triggered Change Risk Reviewer handoffs that inspect bounded staged,
  unstaged, and untracked workspace evidence, preserve proposal and optional
  Tool Builder lineage, and skip model calls for empty or incomplete evidence
- explicit Improvement Analyst disposition routing, recommendation-category
  boundaries, complete top-level candidate replacements, and mandatory null
  candidate patches for subjects without revision surfaces
- an evidence-tested `agent-improvement-analyst@0.2.0` that passes all five
  hidden cross-agent disposition cases
- live cross-agent improvement validation covering candidate-ready,
  engineering-change-required, evaluation-gap, and self-evaluation outcomes
- an offline `npm run portability:check` path covering the supported Node
  runtime, lockfile, local-data exclusions, typecheck, tests, web build, and
  registered-agent catalog without requiring an API key
- a Foundry module (`src/foundry/`) for the Agentic Project Foundry direction:
  versioned, immutable Project Brief artifacts with per-entry provenance
  (`user-stated`, `agent-inferred`, `unresolved`), hash-chained version lineage,
  and independently verifiable acceptance criteria
- operator approve/reject/revise brief decisions pinned to exact version and
  digest, with a hard approval block while unresolved entries or open
  questions remain
- a hardened Foundry artifact store (`runs/foundry/`) with root-bounded paths,
  exclusive writes, and deterministic `{briefId}-v{version}` /
  `{briefId}-t{turn}` artifact identities that fail loudly on collisions
- a registered no-tool `project-intake@0.1.0` agent producing content-only
  brief drafts, provenance-honest entries, intent-typed questions, and
  severity-ranked open issues through strict structured output
- a deterministic `IntakeSessionController` that loops single-shot intake
  turns with all conversation state held in brief artifacts, never model
  context
- intake-turn evidence records linking operator answers, agent-run artifacts,
  and resulting brief versions, including persisted model-failure turns
- interview budget counted by successful turns via the brief version chain,
  with failed attempts bounded by a consecutive-failure retry cap
- an operator intake CLI: `npm run foundry -- intake-start`, `intake-turn`
  with question-linked answers, `intake-status`, plus `brief-create`,
  `brief-show`, `brief-list`, `brief-lineage`, and `brief-decide`
- per-turn provenance-conversion metrics tracking how interview answers turn
  inferred and unresolved content into user-stated content
- a `project-intake-smoke` hidden-expectation verification dataset gating
  interview quality: entry preservation, provenance honesty, contradiction
  challenges, and honest final-turn reporting
- a project-intake instruction revision surface enabling candidate policy
  patches through the standard improvement loop
- deterministic intake turn reconciliation (project-intake 0.2.0): duplicate
  entry ids re-minted and dangling references removed between structural model
  parsing and strict contract validation, with complete repair evidence on the
  output and visible in the intake CLI
- a canonical agent-export contract with an approval gate: exports require an
  approved promotion decision whose effective-policy digest matches the
  current baseline policy
- the first runner adapter: `export-claude-code` packages project-intake as a
  standalone Claude Code skill (verbatim approved instructions, brief and
  turn-output JSON schemas, provenance, feedback-bundle contract, no Workbench
  runtime dependency) in `exports/claude-code/project-intake/`
- provenance-verified feedback import: `import-feedback` validates a returned
  bundle against the export's provenance (exportId, subject identity, policy
  digest) and persists it as `export-feedback` evidence; the first real
  Claude Code interview round trip is ingested, and its reported packaging
  gap (missing turn-output schema) drove the re-export

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
Phase 40 Slice C deterministic promotion gates: complete
Phase 40 Slice D candidate workflow and promotion decisions: complete
Phase 40 Slice D Tool Builder handoff: complete
Phase 40 Slice D Change Risk Reviewer handoff: complete
Documentation Auditor protected non-regression coverage: complete
General-agent live improvement validation matrix: complete
Playwright Failure Triage live improvement validation: deliberately deferred
Phase 41 clean-clone health check: complete locally
Foundry Slice 1 project brief artifact boundary: complete
Foundry Slice 2 intake controller and project-intake agent: complete,
live-validated end to end (real interview reached ready-for-decision)
Foundry Slice 3 intake verification datasets: complete, live-gated
Foundry Slice 4 improvement loop on project-intake: two full cycles run;
both instruction candidates failed gates; operator revise decisions
redirected to an engineering change
Foundry Slice 5 deterministic id reconciliation (project-intake 0.2.0):
complete; live reps-3 baseline improved 10/15 to 13/15, with both
structural failure cases (contradiction, final-turn) now 3/3
Foundry improvement cycle 3: first fully gate-passing candidate;
approved and released as project-intake 0.3.0 (vague answers stay
unresolved with sharper follow-ups; vague-answer case 0.67 to 1.00
with zero regressions; decision f135b4dc, candidate 40373263)
```

Verified test state:

```text
npm run typecheck passed
136 test files passed
484 tests passed
npm run agents -- validate passed (7 agents)
project-intake 0.3.0 live gate: 14/15 (vague-answer 3/3 after the
released provenance policy; the single miss was one behavioral
contradiction-challenge rep, ordinary residual variance)
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

## Foundry Direction

The Workbench is expanding toward an Agentic Project Foundry: a conversational
idea is interrogated into an approved Project Brief, then (in later phases)
planned, scaffolded, implemented in bounded slices, and independently
evaluated. The first milestone is the Intake Agent only; it produces briefs
and never generates code. Decisions on record:

- Intake uses a deterministic controller looping single-shot turns; the model
  never holds conversation state and never fabricates identity or lineage.
- Batched questions per turn are an accepted UX tradeoff over fluid chat.
- Approval hard-blocks briefs with unresolved entries or open questions.
- Sequencing: build the Intake Agent first, then use it as the first export
  subject to Claude Code, exercising the untested export lifecycle.

Live-validated learnings encoded in code: models cite question ids as entry
references (schema rejects the turn; the prompt now forbids it), and
final-turn blocking reports without questions are legitimate.

## Immediate Next Step

Phase 42 third iteration: extend the `agentic-workbench` MCP server (now
twelve tools: reads, provenance-verified `submit_feedback`,
`get_approved_export`, `run_agent`, the intake interview trio, and both
operator decision writes) with long-running evidence operations — gate runs
and improvement-analysis starts backed by operation polling — and decide the
feedback-verification lineage policy (exact exportId vs approved lineage).
Permission model fixed by Decision 084: read everything; write evidence
freely; write decisions with a human attached; never write policy or source.
MCP is the primary agent channel on the Workbench machine; exports remain
the distribution channel elsewhere.

## Broader Roadmap

See `docs/roadmap.md` Current Priorities for the ordered list. In summary:

1. Phase 42 MCP server (IDE evidence connection, Decision 084 model).
2. Route imported export-feedback evidence into improvement-loop packets.
3. Improvement Analyst disposition dataset from recorded live misroutes, then
   its own improvement loop.
4. Next Foundry stage: architecture-and-acceptance-plan agent consuming
   approved Project Briefs.
5. Clean-clone portability verification on the second laptop, covering the
   new foundry, export, and import surfaces.
6. Evidence-backed model qualification; Playwright Failure Triage validation
   against reviewed real failures.
7. Extract agents or replace filesystem persistence only when demonstrated
   ownership, deployment, permission, or query requirements demand it.
