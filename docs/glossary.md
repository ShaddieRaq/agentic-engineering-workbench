# Glossary

## Agent

A software system that uses a model to perform a task and may use context, tools, memory, workflow logic, and evaluation.

A model alone is not an agent.

## Model

The probabilistic component that generates text, structured data, reasoning steps, or tool requests from input.

Examples include OpenAI, Claude, Gemini, and local models.

## Provider

An abstraction that communicates with a model service.

In this project:

```text
AIProvider
OpenAIProvider
FakeProvider
```

## Harness

The runtime control layer around a model.

It manages:

- inputs
- context
- model calls
- tools
- workflow state
- validation
- evaluation
- evidence
- stopping behavior

## Harness Definition

A reusable configuration describing how a class of agent runs should be evaluated or controlled.

Examples:

```text
technical-coach
basic-reliability
```

## Role

Instructions that define how the model should behave.

Example:

```text
Explain concepts clearly and practically.
```

A role is reusable across tasks.

## Task

The work the model is being asked to complete.

Example:

```text
Explain what an agentic harness is.
```

## Context

Supporting information supplied to the model for a run.

Context may include:

- files
- documentation
- previous state
- retrieved passages
- examples
- business rules

## Context Engineering

The discipline of deciding:

- what context to include
- what to exclude
- how to select it
- how to order it
- how to compress it
- how to isolate it
- how to inspect context-related failures

## Scenario

A specific evaluation case with known expectations.

A scenario may define:

- task
- input data
- context
- expected behavior
- evaluators
- failure conditions

## Evaluator

A component that judges a property of an agent run.

## Deterministic Evaluator

An evaluator that uses explicit program logic.

Examples:

- output is not empty
- required phrase exists
- JSON matches a schema
- cited file exists

## Model-Based Evaluator

An evaluator that uses another model to judge a result.

Useful for nuanced properties that cannot be fully expressed as deterministic rules.

## Evaluation Input

The data available to an evaluator.

Current shape:

```ts
{
  role,
  task,
  context,
  prompt,
  output
}
```

## Evaluation Result

The outcome of one evaluator.

Current shape:

```ts
{
  evaluatorId,
  passed,
  message
}
```

## Run

One execution of a harness against a role, task, and context.

## Run Evidence

The persisted information used to understand what happened.

Current evidence includes:

- run ID
- harness ID
- role
- task
- context
- generated prompt
- output
- evaluations
- pass/fail
- duration
- completion time

## Trace

A chronological record of the steps performed during a run.

The current single-step harness has limited tracing. Richer traces become important when tools and multi-step workflows are added.

## Registry

A mapping from an ID to a reusable definition.

Current registries:

- harness registry
- scenario registry

## Structured Output

Model output constrained to a known schema.

Examples:

- JSON object
- typed result
- Zod-validated response

## Quality Gate

A rule that prevents promotion or acceptance when evaluation requirements are not met.

## Regression Evaluation

Running a stable scenario set after a prompt, model, context, tool, or workflow change to detect degraded behavior.

## Repeatability

The degree to which repeated runs produce consistently acceptable results.

Repeatability does not require identical wording. It requires stable success against defined criteria.

## Reliability

The ability of an agent system to complete its intended task within expected quality, safety, cost, and operational boundaries.

## Failure Classification

Assigning a meaningful category to a failed run.

Possible future categories:

- provider failure
- invalid input
- context failure
- task failure
- tool failure
- schema failure
- policy failure
- evaluator failure
- timeout
- unsupported claim

## Orchestration

The logic that coordinates model calls, tools, state, evaluators, retries, and workflow steps.

## Tool

A controlled capability the harness allows the agent to invoke.

Examples:

- read file
- search text
- call API
- run tests
- inspect Git diff

## Adversarial Agent

An agent designed to challenge another agent or system.

It may:

- generate hostile inputs
- test prompt injection
- challenge unsupported claims
- attempt tool misuse
- critique a result
- identify missing cases

## Golden Dataset

A stable set of scenarios and expected outcomes used to measure regression and reliability.

## LLM-as-Judge

Using a language model to evaluate another model’s output.

It is useful for nuanced judgment but can be inconsistent, biased, and sensitive to evaluator prompts.

## Replay

Rerunning a saved task, role, context, and configuration to reproduce or compare behavior.

## Observability

The ability to understand system behavior through:

- logs
- traces
- metrics
- run evidence
- errors
- evaluation results

## Agent Engineering Platform

A system for developing, running, evaluating, debugging, and comparing agent harnesses and workflows.

The completed workbench is intended to become a local agent engineering and reliability platform.