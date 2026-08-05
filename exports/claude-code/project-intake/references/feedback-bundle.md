# Feedback bundle contract (format version 1)

Write `project-intake-feedback.json` as a single JSON object with all
of these fields:

- `exportIdentity`: copy the `subject` and `exportId` values verbatim from
  `provenance.json` (agentId, agentVersion, policyDigest, exportId).
- `sessionDate`: ISO date of the interview session.
- `turnCount`: number of completed interview turns.
- `finalBriefVersion`: the highest brief version number produced.
- `finalBrief`: the complete content of the final brief version file.
- `issuesObserved`: array of strings; every instruction shortcoming, schema
  friction, or confusing moment observed during the session. Empty array if none.
- `observations`: array of strings; anything else worth returning to the
  Workbench (question quality, user reactions, ideas). Empty array if none.

Do not include secrets, credentials, or employer-confidential material in the
bundle. The bundle is evaluation evidence, not a transcript: summarize, cite
brief entries by id where useful, and keep it reviewable.
