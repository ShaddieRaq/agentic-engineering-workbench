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
- multiple evaluator execution
- overall pass/fail status
- CLI evaluation output

Still needed:

- required section evaluator
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

Still needed:

- move task-specific checks out of general harnesses
- configurable provider/model settings
- harness-level execution limits
- harness-level retry policy

## Phase 6 — Scenario Definitions

Status: In progress

Implemented:

- `ScenarioDefinition`
- `explainAgenticHarnessScenario`
- scenario registry
- scenario registry tests

Current work:

- define optional scenario lookup
- combine harness and scenario evaluators
- preserve tasks that have no scenario definition
- remove duplicated required-phrase evaluation
- record scenario ID in run results

Exit criteria:

- general harness policy remains reusable
- scenario-specific expectations remain isolated
- tasks without scenarios behave intentionally
- scenario evaluations appear in persisted evidence

## Phase 7 — Structured Output

Status: Not started

Planned:

- provider support for structured output
- Zod schemas for agent responses
- invalid-output handling
- schema evaluation
- typed parsed results
- raw response preservation

## Phase 8 — Scenario Suites

Status: Not started

Planned:

- run many scenarios together
- scenario datasets
- repeated runs
- pass-rate calculation
- failure summaries
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

1. Finish scenario evaluator composition.
2. Remove scenario-specific checks from `technicalCoachHarness`.
3. Record scenario ID in each run.
4. Add a required-section evaluator.
5. Introduce structured output for one scenario.