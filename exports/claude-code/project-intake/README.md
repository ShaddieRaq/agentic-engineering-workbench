# project-intake 0.3.0 — Claude Code skill

A standalone export of the Workbench's Project Intake agent: it interviews a
software idea into a decision-ready, provenance-tracked project brief. It never
writes code.

## Install

Copy this directory into your Claude Code skills folder:

```bash
cp -r . ~/.claude/skills/project-intake        # user-wide
# or
cp -r . <project>/.claude/skills/project-intake  # single project
```

Then invoke it in a Claude Code session: "interview my software idea" or
`/project-intake`.

## What it produces

- `project-brief/brief-v{N}.json` — one complete brief per interview turn
- `project-intake-feedback.json` — a feedback bundle to return to the
  Workbench (see `references/feedback-bundle.md`)

## Provenance

See `provenance.json`. This package was generated from approved evaluation
evidence (decision f135b4dc-4ac3-439f-a7ff-17b000bfa37e); it must not be
edited by hand, and it never updates itself.
