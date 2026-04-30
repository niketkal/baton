# @batonai/store

## 1.0.0

### Major Changes

- # Baton v1.0.0

  First public release.

  Baton is a CLI-first task-state runtime for AI coding work. It compiles
  transcripts, logs, diffs, and tickets into a structured, lint-validated
  **packet** — a small, durable artifact that the next AI tool can pick up
  and act on without a human re-explaining the work.

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

  ## Platforms
  - **macOS:** native Claude Code plugin + Codex desktop-app wrapper-launcher
  - **Linux:** native Claude Code plugin + Codex CLI wrapper-launcher
  - **Windows:** native Claude Code plugin + Codex .cmd wrapper-launcher

  ## Licenses
  - Source code: Apache-2.0
  - Packet schema (`packages/schema/packet.schema.json`) and normative
    examples: CC0 1.0

### Patch Changes

- Updated dependencies
  - @batonai/schema@1.0.0
