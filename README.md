# Agentic Engineering Workbench

A local TypeScript project for learning and experimenting with:

- Agentic harnesses
- Hermes
- Grok Build
- Context engineering
- Adversarial agents
- Agent evaluation

## Current Goal

Provide a local agent platform where complete, versioned agents can be discovered,
run, verified, inspected, and extended. The model remains one replaceable part
inside explicit contracts, permissions, workflows, assessment, and evidence.

## Working Rules

- Build one small capability at a time.
- Keep company information and credentials out of the repository.
- Prefer visible evidence: code, tests, logs, and reports.
- Start with one orchestrator rather than multiple autonomous agents.

## Open the Agent Workbench

Build and start the loopback-only web console:

```bash
npm run web
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173). The console provides:

- a visual agent lifecycle and catalog overview
- complete manifests, permissions, workflows, datasets, and schemas
- schema-guided agent input with an optional raw JSON mode
- live operation progress for runs and verification
- filtered, runtime-validated persisted evidence
- persistent registration and selection of local project workspaces
- inspectable tool contracts and their consuming agents
- a visual authoring guide and safe agent scaffold command

The catalog and existing evidence remain available without an API key. Live
runs and verification require `OPENAI_API_KEY` in the local `.env` file. The
server binds only to `127.0.0.1` and rejects non-loopback browser origins.

## Use the Evaluation Studio

Open **Evaluation Studio** to run an agent's versioned datasets as a durable
experiment. Each experiment freezes the agent version, workspace, model, and
execution policy, then links to the complete dataset-run evidence that produced
its results.

The Studio provides aggregate reliability, dataset case grids, repeated-trial
input and output, assessments, failures, timing, and aligned baseline-versus-
candidate comparisons. A reviewed case can be downloaded as a dataset-case
draft; dataset authoring remains code-first so browser activity cannot silently
change an agent's evaluation policy.

## Register a Local Project

Register a project once, then select it from the console workspace switcher:

```bash
npm run workspaces -- add /absolute/path/to/project \
  --id my-project \
  --name "My Project"
```

Workspace metadata is stored locally under `.workbench/` and is not committed.
Tools are reconstructed for the selected project root, so their existing path,
symlink, deny-list, and output limits continue to apply.

## Run the Documentation Auditor

Start the console with `npm run web`, select a workspace, open
**Documentation Auditor**, and run it. The agent inventories the project,
reads a bounded selection of documentation and implementation files, and
returns evidence-linked findings without changing the project.

The same operation is available from the CLI:

```bash
npm run agents -- run documentation-auditor --workspace my-project
```

The agent requires an OpenAI API key for a live run. Its complete inspection,
prompt, provider response, assessment, and workspace identity are persisted as
run evidence.

Open the saved run from **Evidence** to view a structured audit report. The
report presents severity-ranked findings, recommendations, validated citation
paths, saved source snapshots, execution stages, model usage, timing, and cost
estimates where pricing evidence is available. It can be downloaded as
Markdown, presentation JSON, or complete raw evidence.

## Generate a Tool Proposal

Open **Tool Builder** in the web console and describe one bounded capability.
The experimental agent generates a TypeScript implementation proposal, Zod
contracts, tests, registration guidance, verification commands, and security
notes. It cannot write files or run generated code.

Run the included read-only example from the CLI:

```bash
npm run agents -- run tool-builder \
  --input examples/tool-builder/read-json.json
```

The saved evidence contains the complete proposed files and deterministic
policy evaluation. A `needs-clarification` or `reject` disposition is a valid
successful outcome when the request is incomplete or unsafe.

The first accepted proposal has been implemented as the registered
`dependency-version-auditor`. Select a workspace and open **Tools** in the web
console to inspect its input/output contract and confirm that it receives no
caller-selected filesystem root. It compares dependency declarations across
bounded `package.json` reads while preserving malformed-file and truncation
evidence.

## Run a Controlled Verification Command

The workbench runner exposes fixed verification actions without accepting an
arbitrary executable, shell fragment, working directory, or argument list:

```bash
npm run verify-command -- --command typecheck
npm run verify-command -- \
  --command test-file \
  --test-file tests/toolExecutor.test.ts
```

The result records the exact application-owned npm arguments, exit code,
bounded output, duration, timeout or execution failure, restricted environment
policy, and pass result. This is a controlled local process—not an operating-
system sandbox—so it should run only against a workspace whose project scripts
you trust.

## Triage a Playwright Failure

The experimental `playwright-failure-triage` agent turns a sanitized Playwright
failure report into a structured, evidence-linked diagnosis. It reads only the
named repository files and may run one fixed targeted-test verification action;
it cannot choose an arbitrary command or edit the workspace.

Run the included example from the CLI:

```bash
npm run agents -- run playwright-failure-triage \
  --input examples/playwright-failure-triage/input.json
```

The saved artifact retains the failure input, bounded file reads, optional
verification evidence, model response, citation checks, and timing. In the web
console, use **Raw JSON** for this nested input and open the completed run for a
specialized triage view with its diagnosis, actions, gaps, and cited sources.

Its registered smoke dataset keeps expected classifications and required
evidence paths hidden from the model. Evaluation Studio therefore distinguishes
"the agent ran successfully" from "the diagnosis matched the reviewed answer."

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

Repeated experiments also print Wilson 95% intervals for each observed pass
rate. These intervals communicate sample uncertainty; overlap is not presented
as proof that two configurations are equivalent.

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

## Run the First Controlled Tool

List one level of repository files through the same validated, root-bounded
execution contract that future agents will use:

```bash
npm run list-files -- --path src --max-entries 20
```

The command prints structured tool-call evidence. Paths outside the repository,
denied paths, invalid inputs, and output-limit behavior are handled by explicit
policy rather than model judgment.

Read one complete text file through the shared permission boundary:

```bash
npm run read-file -- \
  --path src/tools/toolDefinition.ts \
  --max-bytes 4096
```

The tool rejects oversized files, binary content, denied paths, traversal, and
symbolic links that escape the repository.

Search repository text without passing the query through a shell:

```bash
npm run search-text -- \
  --query HarnessResult \
  --path src \
  --case-sensitive \
  --max-matches 10
```

Each match includes its repository path, line, column, and bounded preview.

Inspect selected `package.json` metadata through the bounded reader:

```bash
npm run inspect-package
```

The command returns project identity, module type, scripts, and dependency
maps. Other manifest fields are not included in the evidence.

Inspect bounded working-tree change evidence:

```bash
npm run inspect-git-diff -- --context-lines 3
```

Use `--mode staged` for the index. The caller cannot supply Git commands or
arbitrary flags. Working-tree output includes untracked paths but does not read
their contents.

Run the first explicit local-engineering workflow:

```bash
npm run inspect-repository
```

The workflow collects package metadata, the top-level repository shape, and
current Git changes into one result while retaining each tool call's evidence.
It also selects a small set of observed orientation files and records why each
is a context candidate. Selected files are read in priority order under one
aggregate byte budget, with accepted and rejected candidates recorded
explicitly. File content is retained once in the corresponding read evidence.

Run a live structured repository analysis:

```bash
npm run analyze-repository
```

The command defaults to `gpt-5.4-mini`, saves the complete artifact under
`runs/`, and prints a concise summary. Use `--model gpt-5.4` to override the
model or `--instruction "..."` to supply a specific analysis task.
Structured findings count as successful only when every evidence path exactly
matches a file that was loaded into the analysis context.

Run the bounded multi-step repository assistant:

```bash
npm run assist-repository
```

This workflow performs three explicit steps: controlled inspection, structured
analysis, and deterministic verification. The saved artifact contains final
workflow state, ordered step traces, stop status, provider evidence, and review
checks. Use `--model` or `--instruction` with the same options supported by
`analyze-repository`.

Run the adversarial instruction-defense dataset:

```bash
npm run dataset -- \
  --dataset adversarial-instruction-defense \
  --role roles/untrusted-context-defender.md \
  --harness basic-reliability
```

The cases exercise prompt injection, conflicting instructions, and attempted
tool-boundary misuse. Each run preserves the attack identity and expected
defenses, while the scenario contract requires an explicit trusted-instruction
decision and rejects protected-marker leakage.

## Report and Replay Run Evidence

Summarize compatible individual harness runs already stored under `runs/`:

```bash
npm run report
```

The report preserves accepted source paths and rejected artifact evidence.
Historical or aggregate files that do not match the current `HarnessResult`
contract are skipped explicitly rather than silently included or allowed to
abort the report.

Replay one current harness run with its saved role, task, context, harness, and
scenario policy:

```bash
npm run replay -- --run runs/run-<run-id>.json
```

Replay performs a new model call, stores both runs and their comparison, and
reports whether the outcome or evaluator policy changed. Use `--model` to test
the saved input against a different model.

## Manage Registered Agents

The workbench now includes a first-class local agent catalog. Catalog commands
do not require an API key:

```bash
npm run agents -- list
npm run agents -- describe repository-assistant
npm run agents -- validate
npm run agents -- inventory
```

Run either registered agent with its default input:

```bash
npm run agents -- run repository-assistant
npm run agents -- run change-risk-reviewer
```

These commands make a live provider call and save a versioned `agent-run`
artifact. Supply `--input input.json` for agent-specific input or `--model` for
an explicit model override.

Execute an agent's registered reliability datasets:

```bash
npm run agents -- test change-risk-reviewer \
  --repetitions 3 \
  --concurrency 2
```

Agent tests also make live calls. Each dataset case must meet the pass-rate
threshold recorded in the agent manifest.

Create the source-controlled starting structure for a new learning agent:

```bash
npm run agents -- scaffold my-first-agent
```

The scaffold writes an experimental agent module, smoke dataset, unit test, and
authoring README without overwriting existing paths. Registration remains an
explicit code review step; the browser never creates or executes arbitrary
agent code.
