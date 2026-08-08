# Operator Certification

Four checks that prove the operator can run this platform without
assistance. Each is testable: it either happened or it did not. The
platform is considered operator-complete when all four are checked by
the same person, solo.

Rule for all four: every question the operator is forced to ask a
third party (or an AI assistant) during a certification run is recorded
as either a UX defect or a documentation gap, and fixed before the
certification counts.

## Certification 1 — Greenfield, solo

Take a NEW idea from one sentence to a closed generation with zero
assistance: interview, every gate decision with written rationale,
at least one revise round recovered without help (if none occurs
naturally, none is required — but agent flakes usually oblige),
builder session driven end to end, completion recorded.

- Project: ____________________  Date: __________
- Completion id: ____________________
- Questions asked of anyone: ______ (list → defects/doc gaps)

## Certification 2 — Evolution, solo

Reopen a BUILT project, state new requirements, and drive the full
evolution round: criterion carry judged at the diff, evolution plan
with carried slices verified, successor suite with the accumulated
holdout, delta build with descent-checked submissions, generation
closed.

- Project: ____________________  Date: __________
- Prior completion → new completion: __________ → __________
- Questions asked: ______

## Certification 3 — Improvement cycle, solo

Catch an agent misbehaving (a real failure, not synthetic), get it
measured (dataset case), and drive baseline → analysis → frozen
comparison → promotion decision. An honest **reject** at the gate
counts as a pass — the certification tests the loop, not the outcome.

Standing candidate: the severity mis-calibration pattern (capability
planner and test designer over-grading concerns as blocking — two live
occurrences already recorded).

- Agent + defect: ____________________  Date: __________
- Baseline → candidate case result: __________ → __________
- Promotion decision + rationale: ____________________

## Certification 4 — The explanation, cold

Answer these aloud, unprompted, to a skeptical technical listener:

1. Why can't the builder cheat the acceptance tests?
2. Why are carried slices *computed* instead of trusted from the plan?
3. Why does every suite include a holdout, and why do holdouts
   accumulate across generations?
4. What happens when a model's output disagrees with a deterministic
   check — and why is that the right precedence?
5. What is the difference between an agent defect and a foundry defect,
   and how does each get fixed?
6. Walk one artifact's digest chain: what pins what, and what breaks if
   any link is edited?

- Listener: ____________________  Date: __________
