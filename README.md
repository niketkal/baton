# Baton

**Switch agents without starting over.**

Baton is a CLI-first task-state runtime for AI coding work. It compiles
transcripts, logs, diffs, and tickets into a structured, lint-validated
**packet** — a small, durable artifact that the next tool can pick up and act
on without a human re-explaining the work.

> **Status:** v1.0 — packet schema, CLI contract, and lint rules are stable
> public surfaces. Schema changes require an ADR.

## When to use Baton

Baton solves one problem: **the moment of context loss between AI coding
sessions or tools**. Concrete scenarios:

### Scenario 1 — Your Claude Code session is about to compact

You're 40 messages into a feature. Claude warns it's about to compact.
You know the summary will lose the three failed attempts and the
half-finished test plan you've been iterating on.

```bash
baton failover --to claude-code --copy
# → packet captures objective, current state, attempts, constraints
# → paste into the new session post-compaction
```

The native Claude Code hook (installed by `baton init`) actually does this
automatically — the manual command is for when you want to control timing.

### Scenario 2 — You hit a rate limit and want to switch tools

Mid-refactor, you're rate-limited on Claude. Codex has quota. You don't
want to re-explain what you've tried.

```bash
baton failover --to codex --copy
# → renders the packet in Codex's preferred format (TASK / CONTEXT / NEXT ACTION)
# → paste into Codex and continue
```

### Scenario 3 — Use the right tool for the right phase

Claude is great at exploration and design. Codex is great at mechanical
refactors. Cursor is great at inline edits in a known file. You want the
tools to relay to each other without you being the relay.

```bash
# After Claude finishes the design exploration:
baton failover --to codex --copy        # hand the spec to Codex to implement
# After Codex finishes the implementation:
baton failover --to cursor --copy       # hand to Cursor for fine-tuning
```

### Scenario 4 — Resume a multi-day feature

You shipped half a feature on Monday. It's Thursday. The session is gone,
the branch is half-done, and you'd lose 20 minutes re-reading the diff.

```bash
baton status                           # lists all packets, find feature-x
baton failover --to claude-code --packet feature-x --copy
```

### Scenario 5 — CI failure feeds back into the packet

The PR Claude opened on Monday failed CI on Tuesday. You want the failure
context to be visible the next time you (or a tool) opens the packet.

```bash
gh run view <run-id> --log-failed > /tmp/ci-failure.log
baton outcome ingest feature-x /tmp/ci-failure.log --source ci
# → next failover surfaces the CI failure in the packet's history
```

### Scenario 6 — Hand off to a teammate (or future-you)

Pair work, async handoff, or end-of-day checkpoint. The packet is
plain JSON + Markdown — commit `.baton/packets/feature-x/` and your
teammate runs:

```bash
baton failover --to <their-preferred-tool> --packet feature-x --copy
```

### Scenario 7 — Ticket → AI

A Linear/Jira ticket has the full spec. You don't want to paraphrase it
into the chat box.

```bash
linear issue view ENG-1234 --comments > /tmp/ticket.md
baton ingest ticket /tmp/ticket.md --packet ticket-1234
baton compile --packet ticket-1234 --mode full     # uses your LLM key
baton failover --to claude-code --packet ticket-1234 --copy
```

### When NOT to reach for Baton

- One-shot questions ("what does this regex do?") — just ask the tool
- Trivial work that fits in one un-compacted session
- Greenfield "write me a script that…" with no surrounding context

The cost of Baton is `baton init` once per project plus one CLI call per
handoff. It pays for itself the moment you'd have re-typed context to a
fresh session.

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
  `outcome ingest <id>` and `dispatch <id>`; flag (`--packet <id>`) for
  `compile`, `lint`, `render`, `history`, `migrate`, `ingest`. Run
  `baton <cmd> --help` if unsure.
- **Packet IDs validate to `/^[a-z0-9][a-z0-9._-]{1,127}$/`.** No
  uppercase, no slashes, no `..`. Path traversal attempts are rejected.
- **Artifacts must be ingested before compile.** Use `baton ingest <kind>
  <source-path> --packet <id>` to register a transcript, log, diff, or
  ticket. Ingest writes to `.baton/artifacts/<uuid>/` with a
  `metadata.json` sidecar; `compile` walks that directory and ignores any
  files not registered through `ingest`.
- **`baton failover --to <tool>` defaults `--packet` to the literal
  `current-task`.** Hooks create/update a packet by that name on each
  session, so the default works for the headline "resume my current
  work" flow. Pass `--packet <id>` to target a specific packet.
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

### 5. Manual ingest + compile — `baton ingest` / `baton compile` (rare)

Hooks ingest and compile automatically. To do it by hand (e.g., feeding a
log file or ticket into a packet):

```bash
# 1. Register the artifact under .baton/artifacts/<uuid>/ with metadata
printf "user: build a feature\nassistant: ok\n" > /tmp/sample.txt
baton ingest transcript /tmp/sample.txt --packet test-001

# 2. Compile the packet from all artifacts registered to it
baton compile --packet test-001 --mode fast    # deterministic, no LLM call
baton compile --packet test-001 --mode full    # LLM-assisted synthesis (uses BYOK key)
```

Valid `<kind>` values match the schema (`transcript`, `log`, `diff`,
`ticket`, etc.). `--fast` is the default and what hooks use. `--full`
requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set.

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
baton dispatch feature-x --target codex --adapter clipboard      # to clipboard
baton dispatch feature-x --target codex --adapter stdout         # to stdout
baton dispatch feature-x --target codex --adapter file --out handoff.md
baton dispatch feature-x --target codex --adapter shell --shell-cmd "pbcopy"
```

Positional `<packet>`, separate `--target` (renderer) and `--adapter`
(transport) flags. Use `failover` for the common case; use `dispatch`
when you've already prepared the packet and just want to send it through
a specific adapter.

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
baton conformance                                       # run against this CLI
baton conformance --against /path/to/other/baton-bin    # validate another implementation
baton conformance --cases-dir ./my-cases                # use a custom case directory
```

Validates that the targeted CLI satisfies the published Baton contract.
Useful if you fork or write a compatible implementation.

### 10. Schema migrations — `baton migrate`

```bash
baton migrate --packet feature-x       # bring an old packet up to current schema
```

No-op for v1→v1 today; in place for future schema versions.

### 11. Tear down — `baton uninstall`

```bash
baton uninstall claude-code            # remove a specific integration
baton uninstall --all                  # remove all integrations
baton uninstall --all --dry-run        # preview without writing
```

Requires either an integration name (`claude-code`, `codex`, `cursor`) or
`--all`. Removes the per-tool hook files installed by `init`. Does NOT
delete `.baton/` (your packet history is yours).

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
