# Glossary — the Workbench in industry evals vocabulary

What each Workbench concept is called in the LLM-evals / AI-quality field (2026),
so the platform reads in the language interviewers and job descriptions use.
Terms verified against practitioner sources (Hamel Husain / Shreya Shankar on error
analysis; DeepEval, Braintrust, Inspect, RAGAS, Arize, Anthropic engineering).

## Core vocabulary

| In the Workbench | The field's term | What it is |
| --- | --- | --- |
| Model Comparison Eval | **model comparison eval** ("bake-off") | one agent run across a set of models, scored on quality + cost + latency |
| agent dataset (hidden expectations, min pass rate) | **eval set** / **eval dataset** | curated cases with known-correct answers; "golden" only for a vetted subset |
| hidden expectation | **expected output** / **reference** | the correct answer a case is scored against, withheld from the model |
| blind holdout | **holdout set** | cases withheld so the agent can't overfit; the failure is **contamination** (= leakage) |
| judge agents | **LLM-as-a-judge** graders | a model that grades another model's output |
| null-gate / coverage / scope checks | **code-based / deterministic graders** | non-LLM, rule-based grading (the layer under LLM-as-a-judge) |
| failure triage (ambiguity vs capability-dependent) | **error analysis** → **failure taxonomy** | examining and categorizing failures to find root causes |
| gated comparison (baseline vs candidate) | **regression eval** enforced by a **quality gate** | block a change if it regresses, in CI |
| self-hardening loop (auto-improve) | **regression harvesting** / eval-driven improvement | turn every failure into a permanent regression case |
| evidence store / artifacts | **experiment tracking** / eval logging | immutable, reproducible run records |
| console trajectories | **agent observability** / tracing | — |

Already industry-standard, unchanged: **evaluation / eval**, holdout, acceptance criteria,
structured outputs. Kept as product identity: **Foundry**, **brief**, work-order, capability plan.

## The differentiators (memorable names, always tethered)

These are yours — keep the name, anchor it to the field so it lands:

- **Null-implementation gate** — *"mutation testing for AI-written tests / an eval-validity check."*
  Run the generated tests against an empty implementation; anything that still passes is
  vacuous. Catches the placebo-eval failure mode almost nobody checks for.
- **Self-hardening loop** — *"regression harvesting."* Mine a failure → propose a fix → gate it
  against the eval set before promotion.
- **Doer-vs-Judge floor** — *"LLM-as-a-judge reliability."* A weak grader silently corrupts every
  downstream decision, so grader models are floored to the strong tier and enforced structurally.

Avoid (research-flagged mistakes): "champion-challenger" (that's production shadow-testing, a
different thing); "golden dataset" as the catch-all; "ground truth" (drifts to ML-classification);
"judge alignment" standalone (collides with the RLHF sense).

## One-sentence framing

> An agent evaluation-and-governance platform: eval sets with held-out expected outputs,
> LLM-as-a-judge graders with an enforced reliability floor, deterministic quality gates in CI,
> a model-comparison eval scored on quality/cost/latency, and a loop that turns every failure
> into a regression case — plus a meta-evaluation check that flags vacuous or miscalibrated evals.
