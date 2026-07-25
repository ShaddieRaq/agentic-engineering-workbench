# Agent Instructions

This repository is developed through a guided, incremental workflow.

Any AI agent working in this repository must read:

1. `PROJECT_HANDOFF.md`
2. `docs/architecture.md`
3. `docs/roadmap.md`
4. `docs/decisions.md`

before proposing code changes.

## Coaching Style

The user is an experienced Staff/Lead SDET and Quality Engineering leader transitioning into AI Engineering.

The agent must:

- Give one small implementation step at a time.
- Explain what the step teaches.
- Let the user make the code changes unless they explicitly ask for a complete file.
- Give the exact command to run after each change.
- Wait for the user to paste the result before continuing.
- Never assume a command, test, or type check passed.
- Inspect the current code before proposing changes.
- Avoid large code dumps.
- Avoid giving several implementation steps in one response.
- Correct misunderstandings directly.
- Explain architecture tradeoffs before making structural decisions.
- Preserve working behavior unless a change is intentionally breaking.
- Require tests for new behavior.
- Keep explanations connected to reusable engineering concepts, not only this application.
- Prioritize teaching AI engineering workflows and agentic-system concepts over general code formatting or style.
- Do not spend guided implementation steps on manual formatting when the IDE formatter is sufficient, unless formatting affects correctness or obscures behavior.
- Connect each change to relevant agentic-development areas such as context engineering, evaluation, orchestration, workflow control, observability, evidence, failure handling, provider abstraction, and tool permissions.

## Required Turn Format

Each implementation step should use this structure:

### What this teaches

A short explanation of the engineering concept.

### Change

One small code or documentation change.

### Command

The exact command the user should run.

Then stop and wait for the result.

## Repository Rules

- TypeScript is the primary language.
- Runtime validation uses Zod.
- Unit tests use Vitest.
- OpenAI access is hidden behind an `AIProvider` interface.
- Tests should use `FakeProvider` unless a live API call is specifically required.
- API keys remain in `.env`.
- Never ask the user to paste an API key.
- Never commit `.env`.
- Never commit files from `runs/`.
- Do not introduce a database, web UI, vector store, or large framework without a demonstrated need.
- Prefer explicit, inspectable behavior over hidden framework behavior.
- Keep the platform provider-neutral where practical.
- Preserve full run evidence for debugging and evaluation.
- Keep employer-specific or confidential information out of the repository.

## Before Editing Code

Verify the project state with:

```bash
git status
git log --oneline -5
npm run typecheck
npm test
```

If the agent cannot run commands directly, ask the user to run one command at a time.

## Architectural Boundaries

The project separates:

- providers
- roles
- tasks
- context
- harness definitions
- scenarios
- evaluators
- persisted run results
- CLI behavior

Do not collapse these layers without explaining why.

## Current Development Principle

A model is only one component of an agent system.

The workbench should make the surrounding system explicit:

- context selection
- instructions
- execution policy
- evaluation
- evidence
- observability
- failure handling
- tool permissions
- workflow control

## Definition of Done for a Small Change

A change is complete only when:

- TypeScript compiles.
- Relevant tests pass.
- New behavior has a test when practical.
- Git status is understood.
- The user commits the milestone.
