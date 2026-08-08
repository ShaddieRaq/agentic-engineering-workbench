# Agentic Engineering Workbench

**A local software foundry: untrusted AI agents produce working software,
and every step is gated, verified, and recorded as evidence.**

Models guess. This platform is built on the premise that guesses become
trustworthy only by passing through machinery that cannot guess:
deterministic validators, digest-pinned artifacts, hidden acceptance
tests, and human decisions recorded with names and rationale. The model
is one replaceable part; the trust lives in the structure around it.

## What it does

Two connected factories:

**The Workbench builds agents.** Each agent is a versioned product — a
model call wrapped in a policy, input/output contracts, tool
permissions, and a verification dataset with a pass bar. Agents improve
only through an evidence loop: a recorded failure becomes a dataset
case, an analyst proposes a bounded policy patch, a frozen comparison
measures it against the incumbent, gates check for regressions, and a
human approves the promotion. Nothing about an agent changes by vibes.

**The Foundry employs those agents to build software.** An idea enters
as one sentence and crosses a gated pipeline: an intake interview
produces a decision-ready brief → an architect maps it to components,
slices, and acceptance mappings → a capability planner resolves what
each slice needs → a test designer writes executable acceptance tests
**plus a holdout test that is withheld** → work orders go to a builder
(an external coding agent that never sees the holdouts or this
repository) → every submission is verified out-of-tree against visible
and hidden tests → a human approves each merge → a completion record
pins the finished generation to a commit. When requirements change, the
same pipeline **evolves** the built project: built slices are carried
byte-identical (computed, never trusted from a model), old tests keep
running against new code, and holdout tests accumulate.

The operator drives everything from a local web console: every stage
shows its current artifact, a server-computed banner always states the
single next step, and every decision form records who decided and why.

## Why it exists

Everyone can make an agent write code. Almost nobody can answer, months
later: *who approved this, what evidence backed it, and what still
verifies it?* This repository is a working answer — built by a software
quality engineer applying test discipline to AI systems, and used to
build and evolve real projects. The design decisions (88 of them, each
with rationale) are in [`docs/decisions.md`](docs/decisions.md).

## Quickstart

Requirements: Node.js ≥ 20.19, an OpenAI API key.

```bash
git clone <this repo> && cd agentic-engineering-workbench
npm install
cp .env.example .env        # put your OPENAI_API_KEY inside
npm test                    # the full suite runs with no API key
npm run web                 # console at http://127.0.0.1:4173
```

Then open the console, click **Foundry → Start a new project**, and
follow the worked example in the
[**Operator Guide**](docs/operator-guide.md) — it walks a complete
project (a tiny daily-log CLI) from one sentence to verified, built
software, including the builder session and your first gate decisions.

## The mental model

```
Layer 1 — MODEL      raw guessing            (a provider API)
Layer 2 — HARNESS    model → worker          (contracts, prompt, reconciler, policy, evals)
Layer 3 — FOUNDRY    workers → factory       (gates, digests, holdouts, lineage, evidence)
```

A harness makes one model call usable. The Foundry makes a whole
production process trustworthy: it never accepts what an agent asserts
when it can verify instead — carried work is compared byte-for-byte,
test coverage is validated deterministically, builder code is judged by
tests the builder cannot read, and git state is pinned and
descent-checked. When a guess and a check disagree, the check wins and
the failure is recorded.

## Key properties

- **Append-only evidence.** Artifacts are digest-pinned JSON; decisions
  reference exact digests; nothing approved is ever silently rewritten.
- **Holdout discipline.** Every acceptance suite includes hidden tests;
  builders are verified against them out-of-tree, in a copy they cannot
  read. Disclosure is one-way and deliberate.
- **Human gates everywhere.** Approve/reject/revise at every stage,
  with operator identity and rationale on the permanent record.
- **Deterministic repair or loud failure.** Reconcilers fix mechanical
  model mistakes (dangling ids) with recorded evidence; everything else
  fails with a legible reason.
- **Agents improve through gates too.** Live failures become dataset
  cases; promotions require frozen comparisons with zero regressions.
- **Projects evolve without losing history.** Generations are closed by
  operator-signed completion records; new requirements produce delta
  work on top of pinned, verified baselines.

## Documentation

| Document | Purpose |
| --- | --- |
| [Operator Guide](docs/operator-guide.md) | Every flow, with a follow-along worked example |
| [Operator Certification](docs/operator-certification.md) | The four solo-competence checks |
| [Decisions](docs/decisions.md) | All 88 design decisions with rationale |
| [Roadmap](docs/roadmap.md) | Full build history and current priorities |
| [Architecture](docs/architecture.md) | System structure |

## Status

Actively used by its author to build and evolve real projects. Single
operator, localhost-only by design. Not accepting external
contributions yet; issues and questions welcome.
