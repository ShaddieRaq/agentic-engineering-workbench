# Hermes phase 1 — containment setup (PRECONDITION, not a nice-to-have)

Per docs/research/hermes-agent-memo.md: Hermes's default `local`
backend executes `bash -c` as the host user and its maintainers declare
the OS the only trust boundary. It NEVER runs beside the workbench
uncontained. Nothing below is optional; the order matters.

The wiring itself is DONE and tested: `~/Projects/generated/career-mcp`
(server.js + host.js + shim.js, 6/6 acceptance tests including the full
stdio→shim→TCP→host→server bridge). The design keeps every file the
agent needs OUT of the operator account: Hermes runs as a dedicated
user whose only career-agent artifact is a zero-dependency shim; the
host and CLIs and stores stay under the operator account behind
loopback.

## Step 1 — dedicated macOS user (OPERATOR ACTION, needs admin)

Create a STANDARD (non-admin) account, e.g. `hermes`:
System Settings → Users & Groups → Add User, or:

```sh
sudo sysadminctl -addUser hermes -fullName "Hermes Agent" -password - -home /Users/hermes
```

## Step 2 — make the operator account unreachable

macOS gives new home subdirectories 755 by default; do not rely on it.

```sh
chmod 700 /Users/lazy_genius
```

Verification probes (run after step 1; every one must fail):

```sh
sudo -u hermes ls /Users/lazy_genius                                  # Permission denied
sudo -u hermes cat /Users/lazy_genius/.job-tracker/applications.json  # Permission denied
sudo -u hermes cat /Users/lazy_genius/Projects/agentic-engineering-workbench/.workbench/operator-token  # Permission denied
```

## Step 3 — shared drop for the shim and hook

```sh
sudo mkdir -p /Users/Shared/hermes
sudo cp ~/Projects/generated/career-mcp/shim.js /Users/Shared/hermes/
sudo cp ~/Projects/generated/career-mcp/hermes-kit/pre_tool_call_deny.sh /Users/Shared/hermes/
sudo chmod 755 /Users/Shared/hermes /Users/Shared/hermes/*
```

`node` must be on the hermes user's PATH (`sudo -u hermes node -v`); if
the operator's node lives under an nvm dir inside the (now closed)
home, install a system node (`brew install node` serves all users).

## Step 4 — install Hermes AS the hermes user

Per current official docs at hermes-agent.nousresearch.com (the .org
site is an unofficial stale mirror). Python; install under
/Users/hermes only. Do NOT run it yet.

## Step 5 — Hermes config

Copy `hermes-kit/config.yaml` to `/Users/hermes/.hermes/config.yaml`
and VERIFY the key names against the installed version (config was
researched at repo commit 8359e760): career MCP server via the shim,
`skills.write_approval: true`, `skills.guard_agent_created: true`,
fail-closed `pre_tool_call` hook, gateway/listeners off.

## Step 6 — host under the operator account

```sh
cd ~/Projects/generated/career-mcp && CAREER_MCP_PORT=8377 npm run host
```

(LaunchAgent later if it earns it; a terminal tab is fine for the
smoke.)

## Step 7 — pre-flight probes, then first session

1. Step 2 probes still deny.
2. Hook bites: as hermes, ask Hermes to write a file into
   `~/.hermes/skills/` — must be blocked (exit-2 deny), and the same
   request via skill_manage must land in `~/.hermes/pending/skills/`
   as a staged payload instead.
3. Hook fails closed: temporarily `chmod 000` the hook, make any tool
   call — must be blocked, not allowed. Restore.
4. Career tools work: in a Hermes session, `career_profile` returns
   the profile; `tracker_next` returns real due follow-ups; a
   `tracker_update` note with contact=true lands in the operator's
   store via the CLI (verify with `jobs show <id>` afterward).
5. No listener surprises: `sudo lsof -iTCP -sTCP:LISTEN -a -u hermes`
   shows nothing on 8644/8645/9119.

## Residuals on record

- Loopback is reachable by any local process; the host boundary is "no
  store/file access for the agent user", not localhost secrecy.
- The staged-approval consume path (foundry verifying pending skills)
  is PHASE 2; in phase 1 the operator approves staged skill writes by
  hand in Hermes chat, or ignores them.
- Hook/config key shapes need re-verification against the installed
  Hermes version before first run; the memo's "known unknowns" list
  carries the rest (gateway bind addresses, CVE-2026-7396 fix status).
