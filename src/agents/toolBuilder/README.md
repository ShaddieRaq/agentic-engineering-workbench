# Tool Builder

## Purpose

Turn a plain-language capability request into a structured, reviewable
TypeScript tool proposal containing contracts, implementation files, tests,
registration guidance, verification commands, and security notes.

## Current Boundary

Version `0.1.0` cannot read a workspace, write generated files, install
dependencies, or run commands. It produces evidence for human review and
rejects proposals that violate deterministic authoring policy.

## Next Reliability Step

Expand the versioned dataset with safe, ambiguous, and unsafe requests. Only
after proposal quality is measured should a separate reviewed installation
workflow compile and test generated code in isolation.
