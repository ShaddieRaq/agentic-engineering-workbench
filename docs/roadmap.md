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

Status: Not started

Initial use cases:

- explain a repository
- identify architecture
- summarize changes
- review a diff
- identify risks
- cite supporting files
- propose a test strategy

## Phase 12 — Multi-Step Workflows

Status: Not started

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

Status: Not started

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

Status: Not started

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

Status: Not started

Planned:

- run summaries
- scenario-suite reports
- pass-rate trends
- failure classification
- replay from saved inputs
- prompt/model comparison
- optional LangSmith or other trace export

## Near-Term Priorities

1. Define a structured output contract for one scenario.
2. Extend provider support for structured output.
3. Preserve both raw and parsed model output.
4. Record schema-validation failures as run evidence.
5. Begin scenario suites and repeated-run reliability measurement.
