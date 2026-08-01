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
Phase 11 local engineering assistant: explicit repository inspection complete
```

Verified test state:

```text
npm run typecheck passed
60 test files passed
175 tests passed
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

Add a deterministic context-selection step that derives relevant source-file
candidates from repository-inspection evidence before any model call. Preserve
the selection rationale as workflow evidence.

## Broader Roadmap

1. Add scenario suites and repeated runs.
2. Compare prompts, providers, and context strategies.
3. Add controlled tools.
4. Add multi-step workflows.
5. Add adversarial scenarios.
6. Add model-based evaluators where deterministic checks are insufficient.
7. Generate reliability reports.
