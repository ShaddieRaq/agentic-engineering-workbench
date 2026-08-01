# Agentic Engineering Workbench

A local TypeScript project for learning and experimenting with:

- Agentic harnesses
- Hermes
- Grok Build
- Context engineering
- Adversarial agents
- Agent evaluation

## Current Goal

Build a small local AI harness that uses the OpenAI API, loads controlled context, produces structured output, and records evidence from each run.

## Working Rules

- Build one small capability at a time.
- Keep company information and credentials out of the repository.
- Prefer visible evidence: code, tests, logs, and reports.
- Start with one orchestrator rather than multiple autonomous agents.

## Run a Reliability Dataset

The dataset command executes every registered case through the selected role,
harness, and OpenAI provider. The complete case-linked result is saved under
`runs/`, and case-level pass rates are printed when execution finishes.

```bash
npm run dataset -- \
  --dataset agentic-harness-audiences \
  --role roles/technical-coach.md \
  --harness technical-coach \
  --repetitions 3 \
  --concurrency 2
```

This example makes six model calls: two dataset cases repeated three times.
Use one repetition and one concurrent call while validating your setup.
