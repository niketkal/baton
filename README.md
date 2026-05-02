# Baton

**Switch agents without starting over.**

Baton is a CLI-first task-state runtime for AI coding work. It compiles
transcripts, logs, diffs, and tickets into a structured, lint-validated
**packet** — a small, durable artifact that the next tool can pick up and act
on without a human re-explaining the work.

Use Baton when:

- a session compacts, restarts, or hits a rate limit and you need to resume
  cleanly in the same tool or a different one
- you want one tool to investigate and another to execute without losing the
  failed-attempt history, constraints, and acceptance criteria
- you want CI failures, review feedback, or tickets to flow back into an
  in-flight task without manual re-entry

> **Status:** v1.0 — packet schema, CLI contract, and lint rules are stable
> public surfaces. Schema changes require an ADR.

## Install

```bash
npm install -g @batonai/cli
baton --version    # 1.0.1
```

Requires Node.js 20+.

## Quickstart

The fastest path: drop into a project where you've been working with an AI
coding tool, install Baton, and use `failover` to compile your latest
session into a handoff for the next tool.

```bash
cd ~/your-project
baton init                                    # one-time per project
baton failover --to codex --copy              # compile + render + clipboard
```

Paste into Codex (or whichever tool) and continue.

That's the headline flow. The sections below walk through every command and
show the exact CLI shape — including the conventions that aren't obvious
from `--help`.

---

### CLI conventions

A few patterns repeat across commands. Knowing them up front prevents
"unknown command" / "required option" errors:

- **Packet IDs are passed differently per command.** Positional for
  `outcome ingest <id>`; flag (`--packet <id>`) for `compile`, `lint`,
  `render`, `history`, `migrate`, `dispatch`. Run `baton <cmd> --help` if
  unsure.
- **Packet IDs validate to `/^[a-z0-9][a-z0-9._-]{1,127}$/`.** No
  uppercase, no slashes, no `..`. Path traversal attempts are rejected.
- **`baton compile` does NOT take `--artifact`.** Artifacts live under
  `.baton/packets/<id>/artifacts/`. Hooks drop them there automatically;
  for manual repro you create the dir yourself (see
  [Manual compile](#5-manual-compile-rare) below).
- **`baton failover --to <tool>` picks the most recent active packet
  unless you pass `--packet <id>`.** Useful for "resume my current work";
  surprising if you have multiple packets.
- **Logs are redacted by default.** Set `BATON_LOG_LEVEL=debug-unsafe` only
  if you need raw artifact content in logs (prints a banner; never set in
  CI).

---

### 1. Set up Baton in a project — `baton init`

```bash
baton init
```

Detects which AI tools are present (Claude Code, Codex, Cursor) and offers
to install per-tool integrations:

- **Claude Code** — native hooks (pre-compaction, session-end,
  limit-warning) under `~/.claude/plugins/baton/`
- **Codex CLI** — wrapper launcher at `~/.local/bin/baton-codex`
- **Cursor** — paste-only flow (no files installed; you `render --copy`
  and paste into chat)

Adds `.baton/` to the project (canonical state, redacted logs, SQLite
cache). Safe to commit `.baton/packets/` if you want shared handoffs;
gitignore `.baton/state.db` and `.baton/logs/`.

### 2. Hand off to the next tool — `baton failover`

The headline command. Reads the most recent artifacts that hooks have
captured, compiles a packet (in `--fast` mode, no LLM call, < 5s on a warm
cache), lints it, renders a target-specific handoff, and prints it
(or copies to clipboard with `--copy`).

```bash
baton failover --to codex             # picks current packet
baton failover --to codex --copy      # also copy to clipboard
baton failover --to cursor --copy     # cursor target uses paste-only flow
baton failover --to claude-code --packet feature-x   # specific packet
```

Targets: `claude-code`, `codex`, `cursor`, `generic`.

### 3. Inspect state — `baton status` / `baton history`

```bash
baton status                           # all packets, status, warnings, last update
baton history --packet feature-x       # versions, dispatches, outcomes for one packet
```

### 4. Lint a packet — `baton lint`

```bash
baton lint --packet feature-x          # warnings only (non-blocking)
baton lint --packet feature-x --strict # strict mode for certification
```

Runs BTN001–BTN060 against the packet. `--strict` is what the conformance
suite uses; default mode lets warnings through so failover stays fast.

### 5. Manual compile — `baton compile` (rare)

Hooks compile automatically. Run `compile` directly when you want to
rebuild a packet from updated artifacts without firing failover:

```bash
# Set up an artifact (hooks normally do this for you)
mkdir -p .baton/packets/test-001/artifacts
printf "user: build a feature\nassistant: ok\n" > .baton/packets/test-001/artifacts/transcript.txt

baton compile --packet test-001 --mode fast    # deterministic, no LLM call
baton compile --packet test-001 --mode full    # LLM-assisted synthesis (uses your BYOK key)
```

`--fast` is the default and what hooks use. `--full` requires
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set.

### 6. Render a packet for a specific target — `baton render`

When failover isn't the right shape (e.g., piping into a script or
generating multiple handoffs):

```bash
baton render --packet feature-x --target claude-code
baton render --packet feature-x --target codex
baton render --packet feature-x --target cursor --copy
baton render --packet feature-x --target generic > handoff.md
```

### 7. Push a packet to the next tool — `baton dispatch`

```bash
baton dispatch --packet feature-x --to codex
```

Wraps render + the appropriate adapter (clipboard, stdout, shell, file).
Use `failover` for the common case; use `dispatch` when you've already
prepared the packet and just want to send it.

### 8. Close the loop — `baton outcome ingest`

After the next tool finishes work, record what happened so the packet's
history reflects reality:

```bash
echo '{"status":"completed","summary":"shipped feature X"}' > /tmp/outcome.json
baton outcome ingest feature-x /tmp/outcome.json --source codex
```

Note: positional `<packet>` and `<path>`; `--source` flag.

### 9. Run conformance — `baton conformance`

```bash
baton conformance                      # full public suite
baton conformance --case feature-implementation
```

Validates that this CLI implementation satisfies the published Baton
contract. Useful if you fork or write a compatible implementation.

### 10. Schema migrations — `baton migrate`

```bash
baton migrate --packet feature-x       # bring an old packet up to current schema
```

No-op for v1→v1 today; in place for future schema versions.

### 11. Tear down — `baton uninstall`

```bash
baton uninstall --dry-run              # preview what would be removed
baton uninstall                        # remove integrations + per-tool hooks
```

Removes the per-tool hook files installed by `init`. Does NOT delete
`.baton/` (your packet history is yours).

## What ships in v1

- `baton init` / `baton uninstall` — set up and reverse per-tool integrations
- `baton compile` — turn artifacts into a packet (`--fast` deterministic,
  `--full` LLM-assisted)
- `baton failover` — one-command handoff at the moment of pain
- `baton lint` / `baton lint --strict` — certification rules (BTN001–BTN060)
- `baton render` — target-specific output for Claude Code, Codex, Cursor, or
  generic markdown
- `baton dispatch` / `baton outcome ingest` — close the loop
- `baton status` / `baton history` — inspect a packet's current state and
  past versions, dispatches, and outcomes
- `baton conformance` — public test suite anyone can run against an
  implementation that claims Baton compatibility
- `baton migrate` — schema migration runner (no-op v1→v1 today)

Bring your own LLM key (Anthropic or OpenAI in v1). The CLI does not phone
home; logs are local and redacted by default.

## Documentation

- [Architecture overview](docs/architecture.md)
- [CLI contract](docs/spec/cli-contract.md)
- [Packet schema](docs/spec/packet-schema.md)
- [Lint rules (BTN001–BTN060)](docs/spec/lint-rules.md)
- [Architecture Decision Records](docs/adr/)
- [Contributor guides](docs/guides/)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- Code of conduct — see `CODE_OF_CONDUCT.md` (forthcoming)

## License

- Source code: **Apache-2.0** — see [LICENSE](LICENSE)
- Packet schema (`packages/schema/packet.schema.json`) and normative
  examples: **CC0 1.0** — see [LICENSE-SCHEMA](LICENSE-SCHEMA)

The schema is in the public domain so any tool can read or write Baton
packets without legal friction.
