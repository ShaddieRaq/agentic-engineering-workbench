# Profile Tool — Expanded Build Plan

Status: DESIGN DECIDED, not started (roadmap step 4, the next build).
Method: a 7-facet design panel (data-model, CLI, resume+gates, ingestion,
composition, foundry-plan, risks) + a completeness/consistency critic,
run 2026-08-11. The panel converged on one strong thesis and surfaced 13
contradictions on the substrate; this doc records the reconciliation
decisions that turn the menu into a plan.

---

## The one idea everything hangs on (unanimous across the panel)

**Faithfulness-by-construction.** The render unit *is* the store record
*is* a stable id. The tool never generates free-text resume content — it
selects stored, addressable entries and renders them verbatim through a
tiny, fixed whitelist of formatting transforms. A fabricated claim is
therefore structurally impossible: there is nothing to render that isn't
already a real, operator-entered entry. Persuasive wording is done by an
agent *outside* the tool, and if the agent wants different words, it
edits the store (a new entry) and re-renders — persuasion never touches
rendered text. This is the whole trust story, and it's why the product
is verifiable at all.

---

## The seven forks, now decided

1. **Store model → the tracker's exact model.** A JSON array of
   `kind`-discriminated records, each carrying a *materialized head*
   (current values) plus an *append-only `timeline[]`* (`{at, event,
   changes?, note?}`). `update` mutates the head in place and appends a
   timeline entry — identical to the tracker's `Object.assign(head)` +
   timeline push. The record `id` (a bare `randomUUID()`) is **stable
   for the record's life** and is the faithfulness citation anchor.
   *Why:* it matches the shipped convention exactly, and the stable
   in-place id already satisfies the "id survives corrections"
   requirement the resume gate needs — no separate logical/append id
   layer. (Resolves the 4-way store split C1 and the id model C2.)

2. **Entity taxonomy includes a first-class `summary`.** Kinds: `meta`,
   `header`, `variant`, `skill`, `role`, `bullet`, `education`,
   `certification`, **`summary`**. Making `summary` a stored entity
   (not a field on the header) is load-bearing: a JD-tailored headline/
   summary must be a citeable record, or the zero-free-text invariant
   breaks. (Resolves C4.)

3. **Selection → named `variant` records.** A `variant` carries
   include/exclude selection rules and a referenced `summaryId`; the
   tracker's existing `resumeVariant` string references one by name.
   The singleton "target" is dropped. A separate lightweight
   `target`-style keywords block (targetTitles/keywords) is kept only as
   the COVERAGE baseline and the drill's weak-area signal — it does not
   drive selection. (Resolves C5: `from-profile` = render a named
   variant; `base` = everything active; `jd` = variant ∪ JD-driven
   ranking.)

4. **Coverage semantics → the present-but-unselected / missing-from-store
   split, soft by default.** Coverage distinguishes a skill that exists
   in the store but wasn't rendered (a *selection bug* → hard signal)
   from a JD requirement the operator honestly lacks (an *honest gap* →
   non-blocking note). Default is soft (exit 0 with a warning); hard
   enforcement is opt-in via `--min-coverage`. *Why:* a naive hard gate
   on total coverage would block a resume for a skill the operator
   doesn't have — which pressures fabrication, the one thing the design
   forbids. (Resolves C8; adopts the M2 fix.)

5. **Faithfulness → byte-equality, no fuzzy path.** The tool renders
   stored text verbatim (mod the transform whitelist). The fuzzy
   token-overlap `resume --verify` idea is dropped — it reintroduces the
   exact fabrication surface byte-equality eliminates. (Resolves C9;
   removes M8.)

6. **Ingestion → a subcommand, deterministic formats only in v1.**
   `career-profile ingest <file>` (and the tracker's `--jd` grows the
   same capability later). v1 scope: **txt, md, html, docx** — all
   deterministically extractable. **PDF is deferred**, because PDF text
   extraction is not byte-deterministic across library versions and the
   JD path feeds the coverage gate with *no* operator review, so
   non-deterministic JD text would flake the gate (M5). Scanned/image
   PDF (OCR) is out. *Why a subcommand, not a shared Foundry package:*
   the separate-package path has an unresolved infra question (how an
   isolated Foundry-built tree takes a dependency on another package)
   and would become a prerequisite product; a subcommand folds in with
   no new infra. Extract to shared later if a second consumer justifies
   it. (Resolves C10.)

7. **Transform whitelist pinned; migration dry-run deadlock resolved.**
   The whitelist **is** the faithfulness gate spec, so it is fixed, not
   "roughly these": `{ verbatim, trim, collapse-internal-whitespace,
   ISO-date→"Mon YYYY", end-date→"Present", join-list-with-commas,
   header-literals }`. Dates are stored as **`YYYY-MM`** (not
   `YYYY-MM-DD`) so a never-verified `-01` day can't leak as a
   fabrication (C11). The "writes reject `--json`" vs agent-driven
   migration deadlock (M3) is resolved with a dedicated **read** command
   `import-plan <proposal.json> --json` that validates and previews
   without writing — `--json` is legal because it's a read. (Resolves
   G5, M3.)

---

## Data model (concrete)

Product name **`career-profile`**; store default
**`~/.career-profile/profile.json`** (not `~/.profile/` — collides with
the shell startup file; the name mirrors the `career_profile` MCP tool).

Common envelope on every record: `id` (stable uuid), `kind`, `status`
(`active|retired`, soft-delete only), `createdAt`, `timeline[]`.

Kind-specific heads:
- **`meta`** (singleton) — `schemaVersion`, `generator?`.
- **`header`** (singleton) — `fullName`(req), `email?`, `phone?`,
  `location?`, `headline?` (a *factual* tagline), `links:[{id,label,url}]`
  (each link independently citeable).
- **`summary`** — `text`, `variantId?` (a stored, citeable summary).
- **`variant`** — `name`, `include[]`/`exclude[]` selection rules,
  `summaryId?`. Referenced by the tracker's `resumeVariant`.
- **`target`** (singleton, steering only) — `targetTitles[]`,
  `targetKeywords[]`, `targetSeniority?` — coverage baseline + drill
  signal, not selection.
- **`skill`** — `name`(req), `category`(req enum), `proficiency`(req
  ordered enum familiar<proficient<advanced<expert), `lastUsed?`,
  `provenance`(req enum self-reported|work|certified|education),
  `evidence:EvidenceRef[]`. Evidence is **optional but flagged** by
  `stats` when a work/certified skill lacks it (do not hard-reject on
  add — that would abort migration of legacy skills, M4).
- **`role`** — `title`,`org`,`employmentType?`,`location?`,`startDate`,
  `endDate?` (absent = current). Bullets are separate records.
- **`bullet`** — `roleId`(FK), `text`, `skillIds?[]`, `metric?:boolean`,
  `sortHint?`. The primary renderable claim.
- **`education`**, **`certification`** — standard fields, each citeable.

Bullets/skills/summaries are first-class records (not nested arrays) so
every renderable atom has one id, one CRUD path, one timeline model.

---

## CLI surface (follows tracker/drill conventions exactly)

`node dist/cli.js [--store <path>] [--now <ISO>] <command> [args]` —
global flags before the command; exit 0 success / 2 validation / 3
unknown id; write commands reject `--json` with the exact tracker line.

Writes: `add <kind> [--<field> <v>…] [--note]`, `update <id> …`,
`retire <id>`, `restore <id>`. Repeatable relational flags collected
into arrays: `--evidence <refKind>:<id>`, `--skill-id <id>`,
`--link "<label>|<url>"`, `--target-keyword <kw>`.

Reads (all accept `--json`, null-normalized keys): `list [--kind]
[--status]`, `show <id>`, `stats` (skills by category/proficiency,
evidence-gaps, coverage-of-targets), `import-plan <proposal.json>`
(dry-run validate+preview).

`resume [--variant <name> | --jd <file-or-record-id>] [--format
md|txt|json] [--min-coverage <0..1>]`:
- no `--variant`/`--jd` → **base** (all active entries).
- `--variant <name>` → **from-profile** (render that variant).
- `--jd <file-or-id>` → **jd-tailored** (ingest/resolve the JD, rank by
  keyword match, apply variant if named). Cross-store reads are
  forbidden (agent-as-bus); a `--jd <tracker-id>` convenience is *not*
  built (it would breach product decoupling, C7) — the agent passes JD
  text/file.

---

## Resume assembler + the three gates

Pipeline: **select** (which entry ids, ranked for jd mode) → **render**
(each rendered line records its source entry id) → **gate**.

- **Faithfulness (byte-equality):** every rendered line maps to a real
  store entry id, and its text equals the stored text mod the transform
  whitelist. Zero unsourced spans. Checkable by construction.
- **Coverage:** target/JD keywords represented; split into
  present-but-unselected (hard signal) vs missing-from-store (note).
  Soft default.
- **Format:** document well-formed per target format; accepts an
  early-career profile (skills/education, no roles) without exit 2 (M6).

`--format json` emits a manifest (line → sourceId) — the machine-checkable
faithfulness artifact. **PII note:** if a resume-read tool is ever exposed
to a contained agent via career-mcp, the projection strips `header`
contact fields by default (G7).

---

## Ecosystem composition + migration

- **Migration:** `~/.job-tracker/profile.md` (flat doc) → structured
  store, one-time. The agent proposes structured entries from the doc +
  the operator's resume into a `proposal.json`; the operator reviews via
  `import-plan --json` and applies via `import`. Propose/dispose:
  the profile stays operator-disposed. **Idempotency guard:** `import`
  refuses a non-empty store unless `--allow-update`, and dedupes on a
  stable content key so a re-run of an id-less proposal can't duplicate
  the whole profile (G2). A source-coverage check flags profile.md
  sections not represented in the proposal (G3).
- **Cutover:** tracker, drill, and career-mcp all read profile.md today.
  Sequence: build the store → migrate → repoint the three consumers to
  the store with a "store-present ⇒ store wins, else fall back to
  profile.md" rule → freeze profile.md. career-mcp keeps `career_profile`
  **read-only**.
- **Driving guide** (the generative layer, outside the tool): resume
  wordsmithing over the faithful skeleton, and the meeting-debrief
  fan-out (notes → action items to tracker, prep topics to drill decks,
  facts to the record).

---

## Foundry build plan

Chain: intake → brief → architecture/capability plan → blind acceptance
suite → isolated builder → out-of-tree verification → completion →
optional export.

- **Intake must force-reconcile** the substrate (it's decided here, so
  intake ratifies rather than reopens): store model, taxonomy incl.
  `summary`, variant selection, coverage semantics, faithfulness
  definition, ingestion scope+location, transform whitelist.
- **Acceptance suite:** deterministic tests for store CRUD,
  selection/ranking, assembly, and ingestion (real fixture files: a
  known .docx/.html/.txt with expected text). Gates as executable
  assertions.
  - **CRITICAL test-authoring rule (the panel's sharpest catch, M1):**
    every faithfulness test must be **conjunctive** — assert the real
    claims are present-and-correct AND fabrications are absent. A
    pure-negative assertion ("output must not contain X") passes against
    an empty stub → the null-implementation gate correctly rejects it as
    vacuous. No prior product faced this; the acceptance agent must be
    told explicitly, or the central guarantee ships untested.
- **Holdout:** a JD-tailored render with a planted "JD asks for a skill
  the store lacks" case (must produce a missing-from-store note, not a
  fabrication and not a hard fail) + a planted fabrication attempt (must
  exit 2).
- **Export:** the deterministic tool is a CLI product; the resume
  wordsmithing driving-guide is the export-as-skill candidate later.
- **Where the foundry stretches:** first product whose acceptance rests
  on a *faithfulness* invariant and the conjunctive-test rule; first with
  a binary-parsing dependency (docx). Both are manageable, but new.

---

## Build sequence

store+CRUD → assembler+gates (the novel, risky surface, de-risk early) →
ingestion (subcommand) → migration+cutover → stats + driving-guide.
(Ingestion after the assembler: nothing but `add`/`import` depends on it,
and the gates are the risk.)

---

## Risks (honest)

- Prose quality is uncertified by design — mitigated, not eliminated, by
  the byte-equality gate (the tool guarantees *true*, the agent supplies
  *persuasive*).
- PDF deferred keeps the coverage gate deterministic; revisit only with a
  pinned extractor + golden fixtures.
- Concurrency: more writers than the tracker (CLI + agent proposals +
  career-mcp reads); low real risk for a single-user local store, but add
  an optimistic version/mtime check on write (G1).
- Migration idempotency is the main data-loss hazard — the non-empty-store
  guard + content-key dedupe + source-coverage flag are the mitigations.
- Scope creep across the three resume modes — they are ONE command by
  input; build base first, add variant, then jd.

---

## Still genuinely the operator's call (thin, at intake)

- Output formats beyond md/txt (PDF is deferred by recommendation).
- Whether evidence is ever *required* (recommended: optional + flagged,
  never a hard reject, to keep migration atomic).
- Whether career-mcp eventually exposes a read-only `resume` tool to
  contained agents (recommended: only with the PII projection).
