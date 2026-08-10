# Web-product acceptance verification — proven conventions (2026-08-10)

Empirical result (spike + proofs through the real machinery): the foundry
verifies browser applications with ZERO platform changes. The submission
runner (createProcessSubmissionRunner → vitest) ran a Playwright-driving
acceptance file green in a real project root, and the null-implementation
gate correctly classified the same file as non-vacuous (it fails hard in
an empty stub — module and server both absent).

The whole prerequisite is therefore a suite-contract convention set, to
be pinned in any web product's interface contract:

1. SELF-MANAGING ACCEPTANCE FILES. Each acceptance file owns the app
   lifecycle: beforeAll spawns the real entrypoint (`node server.js`)
   from the project root with PORT=0, waits for a `READY <port>` line on
   stdout (the app MUST print it), then launches Playwright chromium;
   afterAll closes the browser and kills the child. No global setup, no
   runner integration, no fixed ports (parallel-safe, out-of-tree-safe).
2. DEPENDENCIES. `vitest` and `playwright` as project devDependencies
   with a committed lockfile; browsers via `npx playwright install
   chromium` (they land in the user-level cache, so out-of-tree
   verification copies reach them without reinstalling).
3. TESTS ASSERT THROUGH THE BROWSER against rendered DOM and real HTTP —
   never by importing app internals. Deterministic hooks: injectable
   clocks via env (as in the CLI products), `READY` handshake, generous
   per-hook timeouts (30s) since browser boots are slow.
4. NULL GATE UNCHANGED: a web acceptance file that passes in the empty
   stub is vacuous by the same rule as ever; module-resolution and
   spawn failures are the correct failure direction.

Spike artifacts: scratchpad/web-spike (minimal http server + one
acceptance file exercising render + click-through-API round trip).
