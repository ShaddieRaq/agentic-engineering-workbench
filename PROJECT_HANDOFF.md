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
- CLI harness selection
- persisted JSON run records
- overall pass/fail status
- duration tracking
- unique run IDs
- recorded harness IDs
- structured evidence for each run

## Current Evaluators

Implemented deterministic evaluators:

- `NonEmptyOutputEvaluator`
- `MinimumLengthEvaluator`
- `RequiredPhraseEvaluator`
- `ForbiddenPhraseEvaluator`

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
- required phrase: `agentic harness`
- forbidden phrase: `I cannot help`

The required phrase is scenario-specific and should eventually be removed from this general harness.

### `basic-reliability`

General purpose: apply basic reliability checks to any task.

Current evaluators:

- nonempty output
- minimum length of 20

## Current Scenario Architecture

Current files:

```text
src/scenarios/scenarioDefinition.ts
src/scenarios/explainAgenticHarnessScenario.ts
src/scenarios/scenarioRegistry.ts
```

Registered scenario:

```text
explain-agentic-harness
```

The scenario contains:

```text
RequiredPhraseEvaluator("agentic harness")
```

This is the correct conceptual location for that requirement.

## Last Confirmed State

Last confirmed milestone:

```text
Commit: a9467bf
Description: Test scenario registry
```

Last confirmed test state:

```text
19 test files passed
38 tests passed
```

This state must be verified before continuing:

```bash
git status
git log --oneline -5
npm run typecheck
npm test
```

## Current Architectural Question

The next work is to combine:

- general harness evaluators
- scenario-specific evaluators

A naive implementation would do this:

```ts
const scenarioDefinition = getScenarioDefinition(task.id);

const evaluators = [
  ...harnessDefinition.evaluators,
  ...scenarioDefinition.evaluators,
];
```

However, the scenario registry currently contains only:

```text
explain-agentic-harness
```

The CLI can also run tasks such as:

```text
connection-check
```

A required scenario lookup would therefore throw:

```text
Unknown scenario: connection-check
```

## Decision Still Required

The project needs a clear relationship between tasks and scenarios.

Possible designs:

### Option A — Every runnable task must have a scenario definition

Advantages:

- explicit
- consistent
- every task has evaluation expectations

Disadvantages:

- simple utility tasks require boilerplate scenario definitions

### Option B — Scenario lookup is optional

Advantages:

- tasks without scenario-specific checks still run
- low boilerplate
- general harness checks remain available

Disadvantages:

- some tasks may accidentally run without useful scenario evaluation

### Option C — Register zero-evaluator scenarios for simple tasks

Advantages:

- all task IDs still resolve through the registry
- relationship remains explicit

Disadvantages:

- creates definitions that may contain little value

The agent must explain these tradeoffs before implementation.

## Recommended Current Direction

The likely best near-term design is optional scenario lookup:

```text
Harness evaluators always run.
Scenario evaluators run when a scenario definition exists.
```

This preserves current CLI behavior while allowing scenario-specific expectations.

Do not implement this blindly. Inspect the existing registry and `src/index.ts` first.

## Immediate Next Step

Inspect:

```bash
cat src/index.ts
```

Then inspect:

```bash
cat src/scenarios/scenarioRegistry.ts
```

After reviewing both files, decide how optional scenario resolution should be represented.

## Broader Roadmap

After scenario evaluation composition:

1. Remove scenario-specific checks from general harness definitions.
2. Record scenario ID in run results.
3. Add structured-output evaluation.
4. Add scenario suites and repeated runs.
5. Compare prompts, providers, and context strategies.
6. Add controlled tools.
7. Add multi-step workflows.
8. Add adversarial scenarios.
9. Add model-based evaluators where deterministic checks are insufficient.
10. Generate reliability reports.