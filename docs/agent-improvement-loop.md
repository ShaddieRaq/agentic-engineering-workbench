# Evidence-Driven Agent Improvement

Status: Planned

## Purpose

The workbench should help any registered agent improve from its own run and
evaluation evidence. Improvement means changing the agent system around the
model—its instructions, context policy, workflow configuration, model, or
other explicitly supported policy—and demonstrating that the candidate is more
reliable than the baseline.

This capability is not online model training and is not unrestricted
self-modification. The first implementation is a controlled optimizer:

```text
baseline agent evidence
        |
        v
Agent Improvement Analyst
        |
        v
reviewable improvement proposal
        |
        v
bounded candidate policy
        |
        v
baseline/candidate evaluation under frozen conditions
        |
        v
promotion decision
```

## Plain-English Model

An agent performs work. The workbench tests it and saves exactly what happened.
When the agent performs poorly, a second agent examines that evidence and
explains the likely failure mode. It recommends a specific change and predicts
what should improve. The workbench constructs a temporary candidate only from
settings the subject agent has declared safe to vary, runs the baseline and
candidate against the same tests, and shows the comparison. The candidate does
not become the new agent until an operator approves it.

## Existing Foundation

The current platform already provides:

- versioned agent manifests and registered datasets
- immutable agent-run, dataset-run, and evaluation artifacts
- runtime, deterministic case, and aggregate assessment evidence
- repeated execution and bounded concurrency
- baseline-versus-candidate evaluation views
- hidden case expectations
- artifact presentation and source-linked evidence
- a proposal-only Tool Builder
- a Change Risk Reviewer
- explicit tool allowlists and controlled verification commands

The remaining boundaries are:

- linked Tool Builder and Change Risk Reviewer handoffs when proposals need
  capabilities or source changes

## Roles and Responsibilities

### Subject Agent

The registered agent being improved. It continues to own its domain behavior,
input and output contracts, tools, workflow, and deterministic assessment.

### Agent Improvement Analyst

A new read-only meta-agent that diagnoses observed failure modes and recommends
changes. It never writes source files, edits datasets, changes evaluators,
registers agents, or promotes a candidate.

### Candidate Builder

Deterministic application code that accepts only a subject agent's declared
revision schema. It rejects undeclared fields and produces an immutable
candidate configuration with a digest.

### Evaluation Runner

Executes baseline and candidate configurations under the same workspace,
model policy, repetitions, concurrency, datasets, and grading rules.

### Promotion Gate

Deterministic policy that evaluates protected-case regressions, minimum pass
rates, configuration scope, evidence completeness, and operator approval.

### Operator

Reviews the proposal and comparison, then approves, rejects, or requests a new
candidate. The operator remains responsible for source-controlled release
versions.

## Improvement Evidence Packet

The application service—not the model—assembles the evidence packet from saved
artifacts. The packet must be bounded, runtime validated, and linked to one
subject agent and baseline configuration.

Required fields:

- subject agent ID, released version, manifest digest, and effective-policy
  digest
- source evaluation experiment IDs
- frozen workspace, model, repetition, and concurrency configuration
- aggregate and case-level outcomes
- selected failed or unstable trials
- runtime failures, output assessments, and case-assessment messages
- latency and usage evidence when available
- operator objective, such as reliability, cost, latency, or a named failure
  mode
- excluded or truncated evidence with reasons

The packet does not expose protected expectations or protected case inputs to
the Improvement Analyst. Evidence citations use stable artifact, dataset, case,
run, and field identifiers rather than free-form path claims.

## Improvement Proposal Contract

The Improvement Analyst returns a strict structured proposal:

```text
proposalId
subject
sourceEvidence
observedFailureModes[]
rootCauseHypotheses[]
recommendations[]
candidatePolicyPatch | null
suggestedEvaluationCases[]
expectedEffects[]
risks[]
verificationPlan
disposition
```

Each recommendation has one category:

- `instructions`
- `context-policy`
- `workflow-policy`
- `model-policy`
- `tool-capability`
- `output-contract`
- `evaluator`
- `dataset`
- `implementation`
- `no-change`

Only fields included in the subject agent's declared revision schema may appear
in `candidatePolicyPatch`. The patch uses a fixed `changes[]` contract with a
declared `field` and bounded `valueJson` string. The platform parses that string
as JSON and validates the field against the revision surface after generation;
the model never receives an unrestricted-object output schema. Tool, contract,
evaluator, dataset, permission, and implementation changes remain engineering
proposals in the first release.

Proposal dispositions:

- `candidate-ready`: sufficient evidence and a valid bounded policy patch
- `engineering-change-required`: useful diagnosis but code or permissions must
  change
- `evaluation-gap`: the current evaluator or dataset cannot support the claim
- `insufficient-evidence`: no justified improvement should be attempted
- `no-change`: evidence does not support changing the agent

## Agent Revision Surface

Agent implementations currently embed prompts and workflow policy directly in
TypeScript. Automatic candidate testing requires an explicit opt-in boundary.

An improvable registration will declare:

```ts
interface AgentRevisionSurface<TPolicy> {
  schema: ZodType<TPolicy>;
  baseline: TPolicy;
  createCandidate(policy: TPolicy): AgentRegistration;
  mutableFields: string[];
}
```

The exact TypeScript shape may change during implementation, but these
properties are required:

- the baseline policy is inspectable and runtime validated
- mutable fields are explicit
- candidate construction is owned by the subject agent
- undeclared permissions, tools, datasets, and evaluators cannot be added
- the effective policy has a deterministic digest
- candidate construction does not write source files

The Documentation Auditor is the first subject. Its initial revision surface
should expose only instruction and context-selection policy. Tool permissions,
output contracts, citation validation, and evaluation rules remain fixed.

## Candidate Identity and Versioning

The current registry permits one registration per agent ID. A candidate must
not pretend to be a released semantic version.

Introduce an evaluation-only identity:

```text
subjectAgentId
baseVersion
candidateId
effectivePolicyDigest
proposalId
```

Every candidate run and evaluation records that identity. A candidate becomes
a released semantic version only after approval and a source-controlled agent
registration change. Existing artifacts remain readable through optional
candidate fields and backward-compatible schemas.

## Dataset Separation and Leakage Control

Improvement creates a strong risk of optimizing for visible tests. Registered
datasets therefore need an explicit purpose:

- `development`: failures may be shown to the Improvement Analyst
- `regression`: reviewed cases may guide proposals and must continue to pass
- `protected`: inputs, expectations, and trial details are hidden from the
  Improvement Analyst and used only by the promotion gate

The same exact example must not be copied into both the knowledge supplied to a
subject agent and its protected evaluation set. Generalized knowledge and
held-out evaluation examples require separate provenance.

Evaluator or ground-truth changes cannot be bundled with a candidate behavior
change. They require a separate reviewed change and a new baseline evaluation.

## Controlled Improvement Workflow

### Stage 1 — Select Evidence

The operator selects a subject agent and one or more compatible evaluation
experiments. The service validates agent identity, released version, workspace,
and dataset linkage before any model call.

### Stage 2 — Assemble Diagnostic Context

The service selects failed, unstable, or operator-nominated development and
regression cases under explicit count and byte limits. Protected evidence is
withheld.

### Stage 3 — Analyze

The Improvement Analyst produces a cited proposal. Deterministic validation
checks evidence references, allowed recommendation categories, required risks,
and disposition consistency.

### Stage 4 — Review Scope

If the proposal requires code, tools, permissions, contracts, datasets, or
evaluators, it stops as an engineering proposal. If it contains a valid patch
within the subject's revision surface, the operator may authorize candidate
construction.

### Stage 5 — Build Candidate

The Candidate Builder merges and validates the policy patch, constructs the
ephemeral registration, calculates its digest, and preserves the exact baseline
and candidate policy.

### Stage 6 — Evaluate Fairly

The baseline and candidate run against the same dataset snapshot and execution
policy. Stochastic behaviors use repeated trials. Completion order does not
change evidence order.

### Stage 7 — Apply Promotion Gates

The foundation gate requires:

- every protected dataset still passes its minimum threshold
- no protected case regresses
- the target development or regression failure improves
- no unapproved tool, permission, schema, evaluator, or dataset change
- complete baseline and candidate evidence
- no material latency or cost regression beyond configured tolerances
- explicit operator approval

Statistical confidence is reported when sample size permits it; small samples
are not described as proof.

### Stage 8 — Record Decision

Persist an immutable decision containing proposal, candidate, comparison,
policy results, operator decision, rationale, and timestamps. Approval produces
a source-controlled release task, not an automatic code mutation.

## Artifact Model

Add these immutable artifact kinds:

- `agent-improvement-proposal`
- `agent-candidate-evaluation`
- `agent-promotion-decision`

The proposal references existing evaluation artifacts rather than copying raw
evidence. Candidate evaluation references its baseline and candidate dataset
runs. The promotion decision references both and contains the final gate
results.

## UI Flow

Evaluation Studio gains an **Analyze failures** action for eligible completed
evaluations.

The improvement view shows:

1. subject agent and frozen baseline identity
2. selected failure evidence and exclusions
3. failure modes and evidence citations
4. recommended changes grouped by category
5. bounded candidate-policy diff when available
6. baseline-versus-candidate case comparison
7. protected gate results without protected content disclosure
8. approve, reject, or request-revision decision

Raw evidence remains deliberately disclosed, and no browser-authored code is
executed.

## First End-to-End Demonstration

Use Documentation Auditor as the first subject:

1. Refactor its role instructions and context-selection limits into a validated
   revision policy without changing current behavior.
2. Create deterministic synthetic evaluation evidence containing one weak or
   incorrect result.
3. Run Agent Improvement Analyst and verify a grounded instruction or context
   recommendation.
4. Construct a bounded candidate policy.
5. Evaluate baseline and candidate against development, regression, and
   protected cases.
6. Confirm that a useful candidate reaches `decision-pending`.
7. Confirm that a protected regression, permission expansion, evaluator change,
   invalid citation, or insufficient-evidence proposal is blocked.

The Tool Builder and Change Risk Reviewer are later collaborators, not hidden
substeps. A tool-gap recommendation can become a Tool Builder request. A
reviewed source change can be examined by Change Risk Reviewer. Their evidence
remains separate and linked.

## Verification Strategy

### Deterministic tests

- improvement evidence rejects mixed agents, versions, workspaces, and broken
  artifact references
- protected case details never enter analyst input
- proposal citations resolve to supplied evidence
- invalid or expanded candidate policy fields are rejected
- policy digests are deterministic
- baseline and candidate conditions are identical
- evaluator and dataset changes cannot accompany behavior candidates
- protected regressions block promotion
- incomplete evidence cannot be approved
- historical artifacts remain readable

### Agent dataset

The Improvement Analyst receives synthetic evidence for:

- a supported instruction failure with a bounded candidate recommendation
- a missing-tool failure requiring engineering work
- an evaluator gap that must not produce a behavior patch
- insufficient or contradictory evidence requiring no change
- a tempting overfit that must identify protected-evaluation risk
- an invented evidence reference that deterministic policy rejects

### Product verification

- run an improvement analysis from Evaluation Studio
- inspect and export its proposal
- construct a Documentation Auditor candidate
- compare baseline and candidate
- reject one candidate and approve one decision-pending candidate
- verify that no source, dataset, or registered agent changed automatically

## Delivery Slices

### Slice A — Read-Only Improvement Analyst

Status: Complete

- evidence packet and proposal schemas
- deterministic evidence selection and citation policy
- registered `agent-improvement-analyst` with no tools
- synthetic dataset and specialized presentation
- immutable proposal persistence

Outcome: the workbench can explain why an agent underperformed and recommend a
bounded next change, but cannot construct or promote it.

### Slice B — Opt-In Candidate Policies

Status: Complete

- **Complete:** revision-surface contract
- **Complete:** Documentation Auditor policy extraction
- **Complete:** validated in-memory candidate construction
- **Complete:** candidate ID and effective-policy digest evidence
- **Complete:** proposal-patch merging through the subject-owned surface
- **Complete:** backward-compatible candidate identity in run evidence

Outcome: a validated proposal patch can construct an identified, executable
temporary candidate without writing code or changing the released semantic
version.

### Slice C — Comparative Candidate Evaluation

Status: Protected evidence boundary complete

- **Complete:** dataset purposes frozen into run and evaluation evidence
- **Complete:** protected inputs, expectations, outcomes, trials, and aggregate
  signals excluded from optimizer context
- **Complete:** immutable plan snapshot and digest
- **Complete:** frozen baseline/candidate execution using baseline graders
- **Complete:** immutable candidate comparison artifact and evidence references
- **Complete:** deterministic completeness, scope, non-regression, protected,
  improvement, latency, and cost gates

Outcome: the workbench can demonstrate whether the candidate improved.

### Slice D — Promotion Decisions

Status: Executable candidate and decision workflow complete; handoffs remain

- **Complete:** immutable operator approve, reject, and revise decisions
- **Complete:** approval blocked when automated gates fail
- **Complete:** approval emits a source-controlled release task without source
  mutation
- **Complete:** application-service and Evaluation Studio recording against
  saved candidate comparisons
- **Complete:** candidate-ready proposal action that freezes the saved
  workspace, model, datasets, graders, and execution policy; runs baseline and
  candidate; persists the comparison; and links to operator review
- linked Tool Builder and Change Risk Reviewer handoffs

Outcome: the complete loop is usable while release remains deliberate.

### Slice E — Experience Intake

- reviewed operational feedback contract
- candidate dataset and generalized-knowledge proposals
- later Jenkins, CI, or external-system adapters

Outcome: real-world experience can enter the same improvement loop without
making the loop domain- or vendor-specific.

## Explicit Non-Goals for the Foundation

- fine-tuning foundation models
- agents rewriting their own source code
- agents changing their own graders or hidden expectations
- automatic semantic-version promotion
- automatic permission or tool expansion
- production telemetry ingestion
- Jenkins-specific architecture
- claiming improvement from a single stochastic run

## Risks and Mitigations

### Evaluation overfitting

Use protected cases, dataset provenance, repeated trials, and separate evaluator
changes from behavior changes.

### Self-confirming feedback

Do not let the subject agent or Improvement Analyst establish ground truth.
Require deterministic graders, external resolution evidence, or operator review.

### Reward hacking

Keep graders fixed during candidate comparison and inspect qualitative evidence,
not only aggregate pass rate.

### Excessive autonomy

Start with proposal-only behavior. Candidate construction is opt-in and bounded;
promotion always records an explicit decision.

### Cost growth

Bound selected failures, context bytes, repetitions, concurrency, and candidate
count. Preserve usage and estimated-cost evidence.

### Configuration drift

Record exact baseline and candidate policies plus deterministic digests in every
run and comparison.

## Definition of Done

The general improvement foundation is complete when:

- any eligible registered agent can supply compatible evaluation evidence
- the Improvement Analyst produces a cited, policy-validated proposal
- one opt-in subject can construct an executable candidate without source edits
- protected evidence is withheld from proposal generation
- baseline and candidate run under frozen comparable conditions
- deterministic gates block regressions and unauthorized scope expansion
- an immutable operator decision completes the workflow
- the UI exposes every stage and artifact
- tests cover success, rejection, leakage, overfitting, and compatibility paths
- no trusted agent, dataset, evaluator, permission, or source file changes
  automatically

## Reference Principles

The design follows three external principles:

- agent evaluations should combine code-based, model-based, and human grading
  rather than relying on one layer
- automated graders should be calibrated against expert judgment rather than
  replacing it
- evaluation, oversight responsibilities, change management, and go/no-go
  decisions should be explicit and documented

References:

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI: Measuring model performance on real-world tasks](https://openai.com/index/gdpval/)
- [NIST AI Risk Management Framework Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
