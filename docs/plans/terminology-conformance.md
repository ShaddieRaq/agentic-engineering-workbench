# Terminology Conformance — align the Workbench to industry evals vocabulary

Goal: zero mental mapping. What the operator sees — UI, CLI, routes, code, docs — uses the
terms the LLM-evals / AI-quality industry actually uses, so the Workbench connects to the
real world (and to interview conversations). Invented names go; standard names come in.

## Decisions

### ① Conform — rename fully (industry-verified by research, 2 agents)
| Workbench (was) | Industry (now) | Code identifier |
| --- | --- | --- |
| Model Matrix | **Model Comparison Eval** ("bake-off" casual) | `modelComparison` (distinct from the existing gated *comparison*) |
| agent dataset | **eval set / eval dataset** — "golden" = vetted subset ONLY | `evalSet` / `evalDataset` |
| hidden expectations | **expected output** (field) / **reference** (method) | `expectedOutput` |
| failure triage | **error analysis** → **failure taxonomy** (the output) | `errorAnalysis` |
| gated comparison | **regression eval** + **quality gate** (CI blocking) | keep `comparison`; add quality-gate wording |
| "judge" agents | **LLM-as-a-judge** (with the *a*); grader/scorer when scoring | describe as judges/graders (agents keep ids) |
| null/coverage/scope checks | **code-based / deterministic graders** | (tether below) |

Research-flagged do-NOTs: "champion-challenger" (that's production shadow-testing — category error);
"golden dataset" as the catch-all; "ground truth" (contested, ML-classification drift); "gold label";
"failure analysis" (SRE-postmortem connotation); "judge alignment" standalone (collides with RLHF sense).

### ② Keep + tether (differentiators — do NOT genericize away)
- null-implementation gate → keep; tether *"deterministic/code-based grader; eval-validity via mutation testing"*
- self-hardening loop → keep; tether *"regression harvesting / eval-driven improvement"*
- doer-vs-judge → keep; tether *"LLM-as-a-judge reliability — validated by human agreement"*

### ③ Keep (product identity / not conflicting jargon)
- **Foundry** — the pipeline brand. Keep.
- **brief** — a normal word; keep. Reserve "spec" for the future code→spec recoverer (a distinct artifact).
- work-order, capability-plan, intake — the pipeline's own names. Keep.

Already industry-standard, leave alone: **evaluation / eval**, holdout, acceptance criteria.

## Execution protocol
- One term at a time, ALL layers, tests green, one commit each.
- Layers per term: file/dir names · type & function & variable identifiers · API routes · CLI
  scripts & subcommands · console labels & routes · CSS classes · persisted artifact filename &
  schema fields (migrate existing gitignored evidence) · docs · tests · the api.ts client mirror.
- Verify: `git grep -i <oldterm>` returns 0 in tracked files (except this plan + a decisions note).

## Order
1. Model Comparison Eval  ← DONE (files, types, routes, CLI `npm run model-comparison`, UI, CSS, artifact files + schema field `modelComparisonId`, docs, tests; on-disk evidence migrated; 1038 green)
2–6. DONE via a **wording pass** (not code churn — the remaining words were already close to
   standard; deep-renaming acceptable identifiers like `dataset`/`comparison`/`judge`/`triage`
   is churn+risk for no interview value). Operator-facing labels conformed: "Hidden evaluation
   expectation" → "Held-out expected output"; "Failure triage" → "Error analysis"; "Gated
   comparison" → "Regression eval (quality gate)"; ground-truth → reference wording. Differentiators
   tethered in the glossary.
7. DONE — canonical glossary at `docs/glossary.md` (the Workbench in industry vocabulary; interview
   cheat-sheet + portfolio asset).

Deferred: interview-drill card text/tags live in `~/.interview-drill` (separate product) — refresh
those to the glossary vocabulary next.
