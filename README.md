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

## 30-second quickstart

```bash
# install (once)
npm install -g @baton/cli

# in a repo, set up integrations
baton init

# hit a wall in Claude Code, want Codex to take over?
baton failover --from claude-code --to codex --packet current-task --copy
```

That's the canonical path: `baton failover` reads your latest artifacts,
compiles a packet, runs non-strict lint, renders a target-specific handoff,
and copies it to your clipboard. Paste it into the next tool and continue.

For first-time trial without a global install:

```bash
npx @baton/cli failover --from claude-code --to codex --packet current-task
```

## What ships in v1

- `baton init` / `baton uninstall` — set up and reverse per-tool integrations
- `baton compile` — turn artifacts into a packet (`--fast` deterministic,
  `--full` LLM-assisted)
- `baton failover` — one-command handoff at the moment of pain
- `baton lint` / `baton lint --strict` — certification rules (BTN001–BTN060)
- `baton render` — target-specific output for Claude Code, Codex, Cursor, or
  generic markdown
- `baton dispatch` / `baton outcome ingest` — close the loop
- `baton conformance` — public test suite anyone can run against an
  implementation that claims Baton compatibility

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
- Security policy — see `SECURITY.md` (forthcoming)
- Code of conduct — see `CODE_OF_CONDUCT.md` (forthcoming)

## License

- Source code: **Apache-2.0** — see [LICENSE](LICENSE)
- Packet schema (`packages/schema/packet.schema.json`) and normative
  examples: **CC0 1.0** — see [LICENSE-SCHEMA](LICENSE-SCHEMA)

The schema is in the public domain so any tool can read or write Baton
packets without legal friction.
