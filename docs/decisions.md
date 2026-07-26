# Architecture Decisions

## Decision 001 — Use TypeScript

Status: Accepted

### Decision

Use TypeScript and Node.js as the primary implementation stack.

### Rationale

The user already has strong TypeScript and Node.js experience. TypeScript provides useful contracts for providers, evaluators, harness results, and scenarios.

### Consequences

- strong compile-time support
- easy integration with AI SDKs
- familiar testing ecosystem
- runtime validation is still required

---

## Decision 002 — Use Zod for Runtime Validation

Status: Accepted

### Decision

Use Zod schemas for roles, tasks, and context.

### Rationale

TypeScript types do not exist at runtime. External files and model outputs require runtime validation.

### Consequences

- invalid input fails early
- types can be inferred from schemas
- future structured model output can use the same approach

---

## Decision 003 — Hide Model Access Behind `AIProvider`

Status: Accepted

### Decision

Core harness code depends on `AIProvider`, not directly on the OpenAI SDK.

### Rationale

This supports isolated testing and future provider replacement.

### Consequences

- `FakeProvider` can be used in tests
- provider-specific behavior stays isolated
- other providers can be added later

---

## Decision 004 — Use a Fake Provider for Most Tests

Status: Accepted

### Decision

Unit tests should avoid live model calls.

### Rationale

Live model tests are slower, cost money, and may be nondeterministic.

### Consequences

- most tests are fast and repeatable
- live integration checks remain separate
- model behavior still requires scenario evaluation

---

## Decision 005 — Keep Roles, Tasks, and Context Explicit

Status: Accepted

### Decision

Roles and tasks are loaded from Markdown. Context is loaded from explicit file paths.

### Rationale

The user should be able to inspect exactly what entered the model request.

### Consequences

- prompts are easier to review
- context experiments are possible
- run evidence remains understandable

---

## Decision 006 — Persist Complete Run Evidence

Status: Accepted

### Decision

Save each run to a JSON file.

### Rationale

Agent debugging requires knowing:

- what instructions were used
- what context was supplied
- what output was generated
- which checks passed or failed

### Consequences

- runs can later support replay
- the `runs/` directory must remain gitignored
- sensitive context must not be used casually

---

## Decision 007 — Inject Evaluators Into the Harness

Status: Accepted

### Decision

Evaluators are passed into `SimpleHarness`.

### Rationale

The harness should not hardcode one fixed evaluation policy.

### Consequences

- different harness definitions can use different checks
- evaluators can be tested independently
- evaluation composition is explicit

---

## Decision 008 — Separate Harness Policy From Scenario Expectations

Status: Accepted

### Decision

General checks belong to harness definitions.

Task-specific expectations belong to scenario definitions.

### Example

Harness-level:

```text
output must not be empty
```

Scenario-level:

```text
explanation must include "agentic harness"
```

### Consequences

- harnesses remain reusable
- scenarios express specific success criteria
- scenario lookup is optional and keyed by task ID
- harness evaluators always run
- matching scenario evaluators are appended after harness evaluators
- tasks without scenarios continue with general harness checks
- run evidence records the scenario ID or explicit `null`

---

## Decision 009 — Start With Deterministic Evaluators

Status: Accepted

### Decision

Implement explicit code-based evaluators before model-based evaluators.

### Rationale

Deterministic checks are:

- repeatable
- explainable
- inexpensive
- easy to test

### Consequences

- early evaluators are simple
- nuanced quality checks will require additional strategies later
- model-based evaluation remains a later phase

---

## Decision 010 — Start With One Orchestrator

Status: Accepted

### Decision

Do not begin with several autonomous agents.

### Rationale

A single orchestrator is easier to understand, debug, secure, and evaluate.

### Consequences

- multi-agent behavior will be added only when justified
- reviewer or adversarial roles may be introduced as controlled workflow steps

---

## Decision 011 — CLI Before Web UI

Status: Accepted

### Decision

Use a command-line interface for the initial platform.

### Rationale

The project is focused on architecture and reliability, not front-end presentation.

### Consequences

- faster iteration
- easier automation
- no current multi-user or hosted interface

---

## Decision 012 — Keep the Project Local First

Status: Accepted

### Decision

The local repository is the source of truth.

### Rationale

The user wants to learn agent engineering without depending on ChatGPT web as the runtime.

### Consequences

- OpenAI is accessed through an API key
- files, tests, runs, and architecture remain locally controlled
- external platforms may be optional integrations later

---

## Decision 013 — Structured Output Contracts Belong to Scenarios

Status: Accepted

### Decision

Define task-specific structured output schemas in the scenario layer.

Scenario definitions may expose an optional Zod schema. Providers and harnesses consume that contract without embedding task-specific response shapes.

Structured runs preserve the raw model response alongside parsed output and explicit refusal evidence.

### Rationale

Different scenarios require different response structures. Keeping schemas with scenarios preserves separation between reusable execution policy and task-specific success criteria.

Raw output remains necessary for debugging schema failures, replaying validation, and preserving complete run evidence.

### Consequences

- scenarios can adopt structured output incrementally
- the scenario registry exposes schemas through the general `ZodType` boundary
- individual schema modules retain precise inferred TypeScript types
- providers remain unaware of specific scenario fields
- parsing must not overwrite or discard raw model output

---

## Decision 014 — Normalize Provider Failures Into Run Evidence

Status: Accepted

### Decision

Provider adapters translate known SDK failures into provider-neutral categories.
The harness records transport, parsing, and unknown provider failures in
`HarnessResult` and marks the run as failed.

### Rationale

Provider exceptions should not terminate execution without leaving inspectable
evidence. The harness should not depend on vendor-specific exception classes.

### Consequences

- OpenAI connection failures are classified as `transport`
- JSON and Zod failures are classified as `parsing`
- unrecognized provider exceptions are classified as `unknown`
- provider failures produce an empty raw output when no response is available
- execution failure forces overall run failure even when no evaluators exist
