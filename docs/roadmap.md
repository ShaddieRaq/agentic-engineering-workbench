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

Status: In progress

Implemented:

- Zod-validated scenario-suite definitions
- nonempty and unique scenario membership
- `core-reliability` suite definition
- scenario-suite registry
- suite-to-scenario reference resolution
- rejection of unknown scenario references
- sequential scenario-suite runner
- injected scenario executor
- preflight resolution before any scenario executes
- collected `HarnessResult` evidence in suite order
- suite-run result contract containing the suite ID and run records
- runtime-validated positive-integer repetition policy
- sequential repeated runs with scenario-major evidence ordering
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
- sequential dataset-case execution
- injected resolved-case executor
- dataset and case identity preserved with each `HarnessResult`
- preflight rejection before any dataset case executes

Still needed:

- repeated dataset runs and per-case reliability metrics
- regression comparison
- configurable concurrency

## Phase 9 — Reliability Experiments

Status: Not started

Planned:

- compare context strategies
- compare prompts
- compare models
- repeatability measurement
- latency comparison
- token and cost tracking
- baseline versus candidate runs

## Phase 10 — Controlled Tools

Status: Not started

Planned safe tools:

- list files
- read files
- search repository text
- inspect package metadata
- inspect Git diff

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
