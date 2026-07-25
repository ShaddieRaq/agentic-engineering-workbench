# Learning Log

## Purpose

This file captures reusable engineering lessons from the project.

Each entry should contain:

- plain-English definition
- why it matters
- a practical example
- an interview-ready phrase
- evidence from the repository

---

## Agentic Harness

### Plain-English definition

An agentic harness is the control layer around a model that turns a model call into a managed, inspectable workflow.

### Why it matters

The model does not independently control:

- context
- tools
- permissions
- validation
- retries
- evidence
- evaluation
- stopping behavior

### Practical example

The current `SimpleHarness`:

1. validates role, task, and context
2. builds the prompt
3. calls an `AIProvider`
4. evaluates the output
5. calculates pass/fail
6. returns structured evidence

### Interview-ready phrase

> A model is only one component of an agent system. The harness controls the context, execution policy, evaluation, and evidence around it.

### Repository evidence

```text
src/harness/simpleHarness.ts
src/harness/harnessResult.ts
```

---

## Provider Abstraction

### Plain-English definition

A provider abstraction gives the application one interface for communicating with different model services.

### Why it matters

It prevents model-vendor code from spreading through the application.

### Practical example

`SimpleHarness` depends on `AIProvider`.

Tests use `FakeProvider`.

Live runs use `OpenAIProvider`.

### Interview-ready phrase

> I isolate model-specific behavior behind a provider interface so orchestration and evaluation logic remain testable and portable.

### Repository evidence

```text
src/providers/aiProvider.ts
src/providers/openaiProvider.ts
src/providers/fakeProvider.ts
```

---

## Dependency Injection

### Plain-English definition

Dependency injection means giving a component the dependencies it needs instead of letting it construct them internally.

### Why it matters

It makes behavior configurable and easier to test.

### Practical example

`SimpleHarness` receives:

- a provider
- evaluators
- a harness ID

through its constructor.

### Interview-ready phrase

> Evaluators and model providers are injected into the harness, which keeps the orchestration reusable and makes unit testing deterministic.

---

## Deterministic Evaluator

### Plain-English definition

A deterministic evaluator uses explicit program rules to judge a run.

### Why it matters

It produces repeatable and explainable results.

### Practical examples

- output is not empty
- output meets a minimum length
- output includes a required phrase
- output excludes a forbidden phrase

### Interview-ready phrase

> I use deterministic evaluators wherever the requirement can be expressed in code, and reserve model-based judgment for genuinely subjective properties.

### Repository evidence

```text
src/evaluations/evaluateNonEmptyOutput.ts
src/evaluations/minimumLengthEvaluator.ts
src/evaluations/requiredPhraseEvaluator.ts
src/evaluations/forbiddenPhraseEvaluator.ts
```

---

## Harness Definition

### Plain-English definition

A harness definition packages reusable evaluation or execution policy.

### Why it matters

Different classes of agent workflows need different reliability rules.

### Practical example

`basic-reliability` checks:

- output exists
- output has at least 20 characters

`technical-coach` applies stricter checks.

### Interview-ready phrase

> Harness definitions let the platform apply reusable reliability policy across multiple tasks without hardcoding it in the execution engine.

### Repository evidence

```text
src/harness/harnessDefinition.ts
src/harnesses/basicReliabilityHarness.ts
src/harnesses/technicalCoachHarness.ts
```

---

## Scenario

### Plain-English definition

A scenario is a specific evaluation case with task-specific expectations.

### Why it matters

A general harness cannot know every requirement of every task.

### Practical example

The `explain-agentic-harness` scenario expects the output to contain:

```text
agentic harness
```

That expectation should not apply to unrelated technical-coach tasks.

### Interview-ready phrase

> The harness defines reusable runtime policy; the scenario defines what success means for one specific case.

### Repository evidence

```text
src/scenarios/scenarioDefinition.ts
src/scenarios/explainAgenticHarnessScenario.ts
src/scenarios/scenarioRegistry.ts
```

---

## Context Engineering

### Plain-English definition

Context engineering is the discipline of controlling what information the model receives and how that information is presented.

### Why it matters

Agent behavior can fail because context is:

- missing
- irrelevant
- stale
- contradictory
- too large
- malicious

### Practical example

The CLI can load explicit context files with:

```bash
--context README.md
```

The context is validated, included in the generated prompt, and saved in the run result.

### Interview-ready phrase

> Context engineering is not just prompt writing; it is the controlled selection, ordering, validation, and observation of the information available to the agent.

### Repository evidence

```text
src/harness/contextItem.ts
src/harness/contextLoader.ts
src/harness/buildPrompt.ts
```

---

## Run Evidence

### Plain-English definition

Run evidence is the complete record of what entered, happened during, and came out of an agent execution.

### Why it matters

Without evidence, failures are difficult to reproduce or explain.

### Current evidence

- run ID
- harness ID
- role
- task
- context
- prompt
- output
- evaluator results
- overall status
- duration
- completion time

### Interview-ready phrase

> Every run should leave enough evidence to explain what the agent saw, what it produced, and why the system accepted or rejected the result.

### Repository evidence

```text
src/harness/harnessResult.ts
src/harness/runWriter.ts
```

---

# New Entry Template

## Term

### Plain-English definition

### Why it matters

### Practical example

### Interview-ready phrase

### Repository evidence