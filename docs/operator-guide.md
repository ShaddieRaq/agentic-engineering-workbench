# Operator Guide

Everything an operator does, in the order a real project needs it. The
worked example (Part 1) is designed to be followed literally: run the
commands, click the named buttons, and you will take a project from one
sentence to verified, built software.

Throughout: the console lives at `http://127.0.0.1:4173`. On every
project page, the sticky **Next** banner states the single next step —
when in doubt, do what the banner says.

---

## Part 1 — Worked example: build "Daily Log" from scratch

A tiny CLI that appends timestamped notes to a local file and lists
them. Small enough to finish in one sitting; real enough to cross every
gate.

### 1. Start the interview

Console → **Foundry** → **Start a new project**:

- Title: `Daily Log`
- Idea: `A command-line tool that appends short timestamped notes to a
  local file and can list today's notes or search past ones.`

Click **Start interview**. The intake agent asks questions; answer in
plain sentences. Useful answers for this example: notes live in one
plain-text file at a configurable path; `add "<text>"`, `list`
(today's), and `search <word>` commands; exit code 0 on success.

When you have answered enough, end it on your terms — paste into the
context box:

> These answers are final. Choose reasonable defaults for anything
> remaining, write behavioral acceptance criteria a tester can verify by
> running the tool, and close the interview without further questions.

### 2. Approve the brief

The banner switches to **Next: decide on brief vN** and the decision
form is already open. Read the acceptance criteria — each should
describe *product behavior* ("running `add` stores a note retrievable
by `list`"), never the document. Decision **approve**, your operator
name, one-line rationale. Every gate works exactly like this one.

If a criterion is vague, choose **revise** instead and write what must
change — the interview reopens to fix it. Gates exist to be used.

### 3. Generate and approve the plan

Banner: **Generate architecture plan** — the button is in the banner.
The run appears in the amber operations tray (safe to refresh — it
survives). Review the plan page: slices, concerns, and the
**acceptance mappings** line — every mapping should be an automated
type (integration/end-to-end), never `manual`; manual mappings are
flagged red and deserve a revise decision. Approve.

### 4. Capability plan

Banner button again. For a self-contained CLI every need should resolve
to `project-code`. A blocking concern blocks approval by design — read
it; if it is genuinely mis-graded (the brief already answers it),
record **revise** asking for the downgrade with your reasoning, then
**Re-run with the requested revisions**. Approve when clean.

### 5. Acceptance tests

Banner button (this is the slow stage — minutes). Inspect the suite:
every file must exercise the product by spawning it (look for
`spawnSync` in the raw suite), never by reading documents, and exactly
one file is marked **holdout** — the test the builder will never see.
Approve.

### 6. Create the project repo and issue the first work order

```bash
mkdir -p ~/Projects/generated/daily-log
cd ~/Projects/generated/daily-log && git init
```

Banner: **Issue next work order**. Then prepare the builder workspace
(from the workbench repo):

```bash
npm run foundry -- builder-workspace \
  --work-order-id <id from the Build page> \
  --project-root ~/Projects/generated/daily-log
```

This materializes the visible tests, the builder's MCP access, and
`BUILDER.md` — and never the holdout.

### 7. Run the builder

In a **new terminal**:

```bash
cd ~/Projects/generated/daily-log && claude
```

Approve the `workbench-builder` MCP server, then give it:

> Read BUILDER.md and implement this slice. Work on a slice branch,
> never modify acceptance-tests/, and submit with submit_slice when
> your implementation passes the visible tests locally.

The builder implements and submits; the Workbench verifies the
submission **out-of-tree** — a frozen copy the builder cannot touch —
running the visible tests *and* the holdout.

### 8. Decide on the submission

Back in the console, the banner reads **Decide on the submission**. The
panel shows the scope check (acceptance tests untouched, byte-for-byte)
and per-file results including the holdout. Approve if green; the
builder then merges its branch to main (tell it to). Repeat 6–8 until
every slice is approved.

### 9. Close the generation

Banner: **Record the build completion**. Fill the form (project root,
your name; leave "retroactive" unchecked). The Workbench re-runs the
FULL suite — holdouts included — against main and, only if green,
writes the operator-signed completion record pinning the commit. Your
project is done, and provably so.

### 10. Use what you built

```bash
cd ~/Projects/generated/daily-log
node dist/cli.js add "first note"     # (or the interface the suite defined)
node dist/cli.js list
```

Real usage is part of the method: anything the product does badly that
the tests never asked about is your next round's requirements.

---

## Part 2 — Evolving a built project

When real usage finds gaps (it will):

1. **Reopen the brief**: on the latest approved brief version's decision
   form choose **reopen (start an evolution round)**. The interview
   re-arms with a fresh turn budget and automatically carries every
   *standing advisory* — open edges prior gates flagged — asking you to
   decide or defer each.
2. **State the new requirements** in the interview. Approved criterion
   ids are carried or explicitly retired — never silently dropped; the
   criterion diff is displayed at approval.
3. **The banner now offers "Generate evolution plan"** — the plan must
   reproduce built slices byte-identically (validated, not trusted) and
   add delta slices for new work. Then capability, then the successor
   suite: unchanged criteria keep their test files byte-exact, changed
   criteria release theirs for revision, and the suite gains exactly one
   NEW holdout (they accumulate).
4. **Delta build**: work orders are issued only for new slices; every
   old test — including every old holdout — runs against each
   submission, and verification refuses any builder tree whose HEAD does
   not descend from the pinned baseline commit.
5. **Close the generation** as before. Generations chain forever.

## Part 3 — Improving an agent

When an agent misbehaves (asks circular questions, writes untestable
criteria, mis-grades a concern):

1. **Make the failure measurable**: it needs a dataset case with a
   hidden expectation. If one exists, skip ahead; if not, that is an
   engineering task on the agent's dataset (`src/agents/datasets/`) —
   the case must reproduce the failure's *conditions*, never describe
   the desired behavior (a case that hints the answer measures
   compliance, not propensity).
2. **Baseline**: Evaluation Studio → agent → repetitions **3** →
   launch. Expect the new case to fail; that is the measurement.
3. **Analyze**: on the failed evaluation page, fill **Operator
   guidance** — name the revision surface ("only instructions are
   mutable; an instructions fix must be candidate-ready"), state the
   ≤300-character line limit, and require citations only of packet ids.
   Click **Analyze failures**.
4. **Inspect the proposal** (linked from the trace): diagnosis,
   evidence citations, and a bounded policy patch. If the patch is
   wrong, run the analysis again with sharper guidance.
5. **Run frozen comparison** (bottom of the proposal page): baseline
   vs. candidate, same cases, same reps. Gates check improvement,
   regressions, latency, cost.
6. **Promotion decision**: approve only passes when gates pass. On
   approval, the patch is applied to the agent's source policy with a
   version bump and committed — behavior changes only through source
   control with the evidence chain behind it.

## Part 4 — Reading evidence

- Every panel links **Raw →** to the exact JSON artifact behind it.
- Artifacts live in `runs/foundry/` (project chains) and `runs/`
  (agent runs, evaluations, proposals) — append-only, digest-pinned.
- A decision's `briefDigest`/`planDigest`/`submissionDigest` pins the
  exact content decided on; if stored content no longer matches a pinned
  digest, the chain fails loudly. That is the point.

## Part 5 — When something refuses

Refusals are the product working. The common ones:

| Refusal | Meaning | Your move |
| --- | --- | --- |
| "…cannot be approved: <ids>" | Blocking concerns or unresolved items exist | Read them; revise the artifact or resolve upstream |
| "Chain integrity failure: …digest" | Stored content no longer matches what was pinned | Stop; investigate what changed — this should never happen in normal use |
| "…has no revise decision to consume" | Re-run clicked without a revise decision recorded | Record the revise decision first |
| "Slice … depends on …, no approved submission" | Build order enforced | Finish the dependency slice first |
| "HEAD does not descend from the pinned baseline" | Builder built on the wrong base | Builder must branch from current main of the verified repo |
| Stage run fails with a model error | The agent flaked | Re-run once; twice-in-a-row failures are a real defect — capture it |
