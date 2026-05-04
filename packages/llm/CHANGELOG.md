# @batonai/llm

## 1.0.5

### Patch Changes

- - **compiler**: add a dedicated codex rollout JSONL parser. Codex sessions written to `~/.codex/sessions/.../rollout-*.jsonl` are now parsed into structured user/assistant turns (with tool-call placeholders); previously the whole file fell through as a single assistant blob with `COMPILE_TRANSCRIPT_UNRECOGNIZED`. Closes #43.
  - **integrations/codex**: TTY pass-through with post-hoc rollout handoff. `baton-codex` now spawns codex with `stdio: 'inherit'` for interactive sessions (real terminal — no more `stdout is not a terminal`), and after codex exits scans the rollout for limit markers to fire the handoff. Pipe mode preserved for non-TTY / CI use. Closes #42.
  - **cli**: `outcome ingest` now rejects non-existent packets instead of silently materializing an orphan `.baton/packets/<id>/outcomes/` skeleton. Closes #31.
- Updated dependencies
  - @batonai/schema@1.0.5

## 1.0.1

### Patch Changes

- # v1.0.1

  Bug fixes for the v1.0.0 launch.

  ## Security
  - **migrate, outcome ingest, history, compile, failover** all now validate `--packet`
    against the canonical packet-id regex (`^[a-z0-9][a-z0-9._-]{1,127}$`) before
    joining into `.baton/packets/<id>` paths. Closes path-traversal bugs that
    could let a crafted id read or write outside the canonical packet tree.
  - **conformance harness** no longer leaks the parent process environment to
    third-party binaries under test. The runner now passes a small allowlist
    (PATH, HOME, locale, terminal vars) so secrets like `OPENAI_API_KEY`,
    `ANTHROPIC_API_KEY`, `NPM_TOKEN`, etc., are never exposed to a CLI being
    tested via `baton conformance --against ...`.

  ## Correctness
  - **Transcript provenance spans** are now correctly UTF-8 byte offsets, not
    UTF-16 code units. Provenance links into transcripts containing emoji,
    non-Latin scripts, or smart quotes now point at the right ranges.

  ## CLI
  - `baton --version` prints the installed version (e.g. `1.0.1`) instead of
    the hardcoded `0.0.0` from a build-time constant.

  ## Performance
  - `baton status --packet <id>` reverse-scans `dispatch.jsonl` /
    `outcomes.jsonl` for single-packet lookups instead of reading the entire
    file. List mode (no `--packet`) keeps the full scan because it genuinely
    needs every entry. A future v1.x release may swap the JSONL journal for a
    SQLite index if usage volume justifies it.

  ## Docs
  - Each `@batonai/*` package now ships its own `README.md` so the npmjs.com
    package pages render useful content instead of "ERROR: No README data
    found!".

  ## Release pipeline
  - `release.yml` no longer references `NODE_AUTH_TOKEN`. Trusted publishing
    is configured per-package on npm; OIDC handles auth. No long-lived token
    exists in the repo or in CI secrets.

- Updated dependencies
  - @batonai/schema@1.0.1

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
