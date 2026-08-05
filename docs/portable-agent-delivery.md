# Portable Agent Delivery

## Product Boundary

The Agentic Engineering Workbench is a private authoring, evaluation,
improvement, and CI-runner environment. The product delivered to another
repository or team is an approved agent package, not the Workbench itself.

Interactive exports should use the target host's normal runner:

- Claude Code skill
- Cursor rule or agent package
- Codex-compatible package
- another explicitly supported repository-native format

Reviewed Jenkins or GitHub Actions automation may use the Workbench runner when
its evidence and permission boundaries are required.

## Data Boundary

The following are machine-local and do not transfer through this repository:

- `.env` and provider credentials
- workspace registrations
- `runs/` and persisted evaluation evidence
- temporary controlled workspaces
- employer source, datasets, logs, attachments, and failure artifacts

Employer material must remain on an approved employer-controlled machine and in
approved storage. Register the employer repository as an external workspace;
do not copy it into this personal repository. Local execution does not by
itself guarantee confidentiality because selected context may be sent to the
configured model provider.

## Clean-Clone Readiness

A second laptop is ready only when a fresh private clone can:

1. install dependencies
2. configure its own uncommitted `.env`
3. pass `npm run typecheck`
4. pass `npm test`
5. start Evaluation Studio
6. register a sanitized external workspace
7. run the existing-agent acceptance checks
8. keep local evidence out of Git

The local workspace registry and historical run artifacts are intentionally not
portable. Each machine establishes its own approved workspaces and evidence.

The repository provides one offline health-check path:

```bash
npm ci
npm run portability:check
```

This verifies the supported Node runtime, lockfile, required scripts, local-data
Git exclusions, type checking, tests, production web build, and registered-agent
catalog. Provider configuration is optional for this check and remains required
only for live model execution.

## Existing-Agent Acceptance Set

Before connecting an employer repository, verify:

- Documentation Auditor completes grounded regression and protected cases
- Repository Assistant preserves partial inspection evidence
- Tool Builder remains proposal-only and policy-valid
- Change Risk Reviewer blocks clean, failed, or incomplete Git evidence before
  model review
- Improvement Analyst passes its hidden disposition matrix and never creates a
  candidate patch for an agent without a revision surface

Playwright Failure Triage remains the final validation milestone.

## Export Readiness

An agent is ready for standalone export only when:

- its versioned instructions, schemas, workflows, and required tools are known
- relevant development, regression, and protected evidence passes
- permissions are no broader than the target runner requires
- host-specific packaging does not silently change agent policy
- provenance links the export to the approved Workbench evidence
- no employer-specific evidence is embedded in the generic package

The first export adapter is implemented: `npm run foundry -- export-claude-code
--decision <promotion-decision-artifact-id>` packages `project-intake` as a
standalone Claude Code skill in `exports/claude-code/project-intake/`. The
export factory refuses non-approved decisions and refuses to export when the
current baseline policy digest no longer matches the approved effective-policy
digest. The package embeds the approved instruction lines verbatim, the brief
content JSON schema, full provenance, and a versioned feedback-bundle contract
(`project-intake-feedback.json`) so real usage returns as evaluation evidence.
Feedback-bundle import is implemented: `npm run foundry -- import-feedback
--bundle <path>` verifies the bundle's export identity (exportId, agent
identity, and policy digest) against the package's `provenance.json` and
persists a verified `export-feedback` evidence record in `runs/foundry/`.
The first real round trip completed on 2026-08-04: a genuine Claude Code
interview returned a bundle whose observed packaging gap (missing turn-output
schema) was fixed and re-exported. The Cursor adapter remains planned.

The Phase 42 MCP connection (Decision 084) has its first cut implemented:
`npm run mcp` serves a stdio MCP server (`agentic-workbench`) over the
existing stores with six tools — read tier (`list_agents`, `describe_agent`,
`list_artifacts`, `get_artifact`), evidence-write tier (`submit_feedback`,
provenance-verified), and delivery tier (`get_approved_export`, serving the
approved package files for local installation). The server needs no provider
credentials and never writes agent policy or source. Claude Code sessions in
this repository pick it up from `.mcp.json`; other projects register it with
`claude mcp add agentic-workbench -- npm --prefix <workbench-path> run
--silent mcp`.

The second Phase 42 iteration makes MCP the primary local agent channel:
`run_agent` executes any registered agent on the Workbench's measured model
with full run evidence; `intake_start`, `intake_turn`, and `intake_status`
drive evidence-grade project-intake interviews through the controller from
any IDE session; `record_brief_decision` and `record_promotion_decision`
record operator-attributed decisions under the same constraints as the CLI
and web boundaries. The stdio server starts without provider credentials;
model-invoking tools require the machine's `OPENAI_API_KEY` at call time.

Division of labor: on the Workbench machine, MCP is the primary channel
(always the current approved behavior, evidence persisted); the exported
package remains the distribution channel for machines and people without the
Workbench, fetched fresh via `get_approved_export` rather than permanently
installed. Deferred to iteration three: gate runs and improvement-analysis
starts with operation polling, and the feedback-verification lineage policy
(bundles currently verify only against the exact exportId, so re-exports
orphan unimported bundles by design).
