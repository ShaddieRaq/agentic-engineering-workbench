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

## Run a Baseline-versus-Candidate Experiment

The experiment command holds the dataset, scenario policy, harness, model, and
execution policy constant while changing the role instructions. It persists
both evidence sets and prints the observed reliability and average-latency
change for every case. It also prints total-token and estimated-cost changes
when complete usage evidence and a matching pricing policy are available.

```bash
npm run experiment -- \
  --experiment audience-role-comparison \
  --dataset agentic-harness-audiences \
  --baseline-role roles/technical-coach.md \
  --candidate-role roles/audience-aware-coach.md \
  --harness technical-coach
```

With default execution settings, this makes four model calls: two baseline
cases and two candidate cases.

Cost is an estimate derived from persisted token counts and a dated pricing
policy. Reliability, latency, tokens, and cost remain separate signals in the
saved experiment artifact.

To compare models, use the same role file for both variants and change only the
model flags:

```bash
npm run experiment -- \
  --experiment model-comparison \
  --dataset agentic-harness-audiences \
  --baseline-role roles/audience-aware-coach.md \
  --candidate-role roles/audience-aware-coach.md \
  --baseline-model gpt-5.4 \
  --candidate-model gpt-5.4-mini \
  --harness technical-coach
```
