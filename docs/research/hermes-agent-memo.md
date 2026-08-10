# Hermes Agent — research memo (roadmap step 0)

Date: 2026-08-09. Method: 6-angle parallel research sweep + adversarial
gap-check + 4 source-level follow-ups (one agent shallow-cloned the repo
and read the Python at HEAD commit 8359e760). ~110k chars of sourced
findings distilled here; every load-bearing claim carries a primary
source. Full findings: session scratchpad `hermes-findings.md`.

## The five verdicts

**Q1 — Hermes hosting our CLIs: WIRING, not construction.**
Hermes is a full MCP client: stdio servers declared in
`~/.hermes/config.yaml` (command/args/env), per-server tool
include/exclude, tools surfaced as `mcp_<server>_<tool>`. External CLIs
are explicitly NOT first-class tools — the documented path for
structured external tooling is MCP. We already ship three MCP servers;
phase 1 is a thin "career" MCP server wrapping the tracker and drill
CLIs plus one config entry on the Hermes side.
(docs: features/mcp; features/tools)

**Q2 — Routing skill-writing through our verification pipeline:
FEASIBLE, with a precise architecture and one fragile joint.**
From source at commit 8359e760:
- `skills.write_approval` (default OFF): when ON, every mutating
  `skill_manage` action — including the background Curator's, which is
  origin-tagged `background_review` — stages a full replay payload as
  plain JSON under `~/.hermes/pending/skills/`. Never inline-approves.
- BUT two documented bypasses: the Curator's own prompt instructs raw
  `terminal` mv/mkdir on the skills dir (ungated), and issue #60440:
  generic `write_file`/`patch` tools write `~/.hermes/skills/` directly.
- The enforcement point that covers both: the `pre_tool_call` hook
  (Python plugin or shell hook, exit 2 blocks, has a fail-closed mode),
  fired on EVERY tool call including the Curator fork's. A deny-hook on
  direct skill-dir writes forces all mutations through the staged queue.
- The fragile joint: approve/reject exists ONLY as interactive/gateway
  slash commands — no headless CLI verb. Pending records are plain JSON
  (reject = unlink; approve = internal Python API
  `apply_skill_pending`, an unsupported contract). A foundry
  verifier would consume pending JSONs, run its pipeline, and either
  drive the internal API (fragile) or surface a verified/rejected
  verdict for one-tap human approval in chat (robust).
So: write_approval ON + guard ON + fail-closed pre_tool_call deny-hook
+ foundry as the reviewer of the pending queue = governed
self-improvement, today, without forking Hermes.

**Q3 — Trust surface on a personal Mac: SIGNIFICANT. Do not run it
next to the workbench without containment.**
- Default `local` backend executes `bash -c` as the host user; the
  maintainers' own SECURITY.md declares the OS the ONLY trust boundary.
- Skills are injected into every session's system prompt — a persistent
  prompt-injection vector; the content scanner
  (`skills.guard_agent_created`) defaults to FALSE, is keyword-regex
  only, trivially evadable, fail-OPEN twice (config unreadable → off;
  scanner crash → write proceeds), and returns its findings to the
  agent, which can iterate until it passes (#53491). A PR flipping the
  default fail-closed (#53492) is blocked citing the maintainers'
  opt-in rationale.
- Network listeners on 8644 (webhook) / 8645 (proxy) / 9119
  (serve/JSON-RPC); default binds unverified by this research;
  CVE-2026-7396 (unauthenticated path traversal in a gateway adapter)
  had "interim mitigation" status.
Containment prescription if/when we run it: dedicated macOS user or
VM/container; a dedicated Hermes profile; filesystem access to our
stores ONLY via our MCP servers (never raw paths); workbench tree and
operator token unreachable; write_approval + guard ON; deny-hooks
fail-closed; gateway platforms minimal.

**Q4 — Adoption claims: REAL, slightly understated.**
GitHub API on 2026-08-09: ~227,976 stars, ~44,780 forks, MIT, Python,
v0.20.0 released 2026-08-03, ~30,199 open issues+PRs. The "launched
Feb 25, 2026" date is SEO-lore — earliest verifiable public activity is
March 2026; repo created July 2025 (it descends from OpenClaw). Caveat:
hermes-agent.org presents as official but is an unlinked, partly stale
mirror — the canonical site is hermes-agent.nousresearch.com.

**Q5 — The self-written-skill problem: REAL, DOCUMENTED, and
UNSOLVED — and it is exactly our shape of problem.**
Documented failure classes (all primary-source issues):
- No correctness verification of any kind: #416 ("Skill Validation &
  Linting", filed by the co-founder himself, P3, open since March);
  #25833 "the agent is simultaneously the author, executor, and quality
  inspector of its own skills" — open, zero maintainer response.
- Bad learning persists: #6051 a transient environment failure was
  written into a skill as durable guidance ("learned helplessness" —
  the agent avoided a working tool for weeks).
- Ungoverned mutation: #70128 background review rewrites USER-authored
  skills unrecoverably on a default install; #64926 skills modified
  mid-conversation, cannot be made read-only; #60440 gate bypass.
- Drift with no lifecycle: staleness detection, version provenance,
  upstream-merge reconciliation all requested, none implemented
  (#11425, #8302, #1780).
- The project is converging on our pattern but has not shipped it:
  PR #80820 (open) proposes sandboxed-execution verification of
  precipitated skills; #41444 proposes provenance tiers + human gates.

## Roadmap implications

1. Phase 1 (Hermes hosts the career agents) is cheap and contained —
   an evening of MCP wrapping when its turn comes. No change to the
   agreed order (tracker gen-3 → Showroom → Hermes 1 → Hermes 2).
2. Phase 2 (skill foundry) is feasible without forking Hermes, via
   write_approval + pre_tool_call enforcement + pending-queue
   consumption. Two strategic postures, not mutually exclusive:
   a private integration (our verifier guards our instance), and an
   upstream contribution (a verification plugin / PR aligned with
   #80820 and #416 — the project's own maintainers have left the door
   open on exactly the problem our machinery solves). The upstream
   route carries outsized visibility for the operator's story.
3. New product-class insight: Hermes skills are the open Agent Skills
   format (agentskills.io, Claude-Code-compatible SKILL.md). A "skill
   certifier" generalizes beyond Hermes: acceptance criteria + null
   gate for script-bearing skills across the whole ecosystem. Prose-only
   skills resist automated verification — scope honestly if pursued.
4. Trust posture is non-negotiable: Hermes never runs beside the
   workbench uncontained. The containment prescription above is a
   precondition of phase 1, not a nice-to-have.

## Known unknowns (carried forward)
Whether the web dashboard or gateway API can approve staged writes
programmatically; whether pre_tool_call shell hooks fire in the Curator
fork under ALL configs (source says yes; not runtime-verified); default
bind addresses of the three listeners; CVE-2026-7396 final fix status;
plugin API for first-class non-MCP tools.
