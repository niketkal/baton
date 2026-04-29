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

> **Status:** pre-v1. The packet schema, CLI contract, and lint rules are the
> public surface and are being stabilized. Don't depend on this in production
> yet.

## Quickstart

> **Pre-v1:** Baton is not yet published to npm. The instructions below
> build from source. Once v1.0.0 ships, `npm install -g @baton/cli` will
> work directly and the quickstart will collapse to a single command.

```bash
# 1. Clone and build
git clone https://github.com/niketkal/baton.git
cd baton
pnpm install
pnpm -r build

# 2. Run the CLI directly (prints `0.0.0` until v1.0.0 is tagged)
node packages/cli/dist/bin.js --version

# 3. (Optional, macOS/Linux) Symlink as `baton` on your PATH.
# On Windows, invoke `node packages\cli\dist\bin.js` directly or
# create a `.cmd` shim that does the same.
ln -s "$(pwd)/packages/cli/dist/bin.js" /usr/local/bin/baton
chmod +x /usr/local/bin/baton

# 4. Use it
baton init                               # set up integrations in your project
baton failover --from claude-code --to codex --packet current-task --copy
```

`baton failover` reads your latest artifacts, compiles a packet, runs
non-strict lint, renders a target-specific handoff, and copies it to your
clipboard. Paste it into the next tool and continue.

The npm and `npx @baton/cli ...` paths described in
[ADR 0007](docs/adr/0007-distribution-npm-brew.md) become available once
v1.0.0 is published.

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
