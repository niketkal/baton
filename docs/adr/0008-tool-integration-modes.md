# ADR 0008: Tool integration modes — native hook → wrapper launcher → paste

- Status: Accepted
- Date: 2026-04-26

## Context

Baton works with several agent tools. Each tool exposes a different hook
surface:

- some expose a documented plugin or hook API
- some run as subprocesses whose stdout can be observed
- some are GUI applications whose chat transcript is not accessible to
  sibling processes
- some have nothing at all and the user has to copy-paste

If we picked one integration mode and only supported tools that expose it,
we would cover one tool well and leave the rest with no story. If we
supported only the lowest-common-denominator (paste), we would lose the
auto-checkpointing that makes Baton useful in practice.

The integration matrix has to degrade gracefully so that **every** target
tool has a working path, and the path automatically upgrades when a
better surface is available.

## Decision

Define three integration modes, in fallback order:

1. **Native hook** — the tool's documented hook / plugin API.
2. **Wrapper launcher** — a small shim (e.g. `baton-codex`) that runs the
   tool as a subprocess and watches its stdout for known events (limit
   warnings, session-end markers).
3. **Paste** — the user pipes a transcript into `baton ingest transcript
   -` and runs `baton compile` / `baton render` manually.

Every integration in `@batonai/integrations` implements:

```ts
interface Integration {
  id: string;
  detect(): Promise<DetectResult>;
  modes: IntegrationMode[];                // ordered by preference
  preferredMode(): IntegrationMode;
  install(mode: IntegrationMode, opts: InstallOpts): Promise<InstallResult>;
  uninstall(): Promise<void>;
  dryRun(mode: IntegrationMode): Promise<InstallPlan>;
  status(): Promise<IntegrationStatus>;
}
```

`baton init` walks detected integrations, picks each integration's
`preferredMode()` from its supported list, and presents an `InstallPlan`
per integration. The user confirms (or `--yes`) before any install runs.
`baton uninstall <integration>` reverses every recorded change using
`installed.json`.

Concrete v1 mapping:

| Tool | Primary mode | Fallback |
|---|---|---|
| Claude Code | native hook | wrapper launcher |
| Codex CLI | wrapper launcher | paste |
| Cursor | wrapper launcher | paste |
| Generic | paste | (none) |

Plugin install location resolution for native hooks follows a
deterministic, offline-safe order: a versioned compatibility table per
tool version, then probe a short list of known candidate paths, then
interactive fallback. The path the user supplies is recorded so the
prompt does not repeat.

## Consequences

Positive:

- Every tool has a working integration story on day one. No "we don't
  support X" wall.
- `baton init --dry-run` always shows exactly what would change — the
  trust boundary for hook installation.
- `baton uninstall` is a first-class operation with the same shape as
  install. An integration that does not implement `uninstall()` cannot
  ship.
- Fallback ladders mean a tool that adds a hook API later upgrades by
  swapping the integration's `preferredMode()`, not by rewriting the
  integration.

Negative:

- Three modes means three test paths per integration. Mitigated by
  shared test fixtures and a `dryRun()` test that asserts the plan
  matches expectations.
- Wrapper launchers can drift if the wrapped tool changes its stdout
  format. Mitigated by versioned compatibility tables and integration
  tests pinned to known versions.
- Paste mode is opt-in and manual. We accept this — it is the
  lowest-common-denominator path and the alternative is no support at
  all.

## Related

- The CLI contract's integration matrix in
  `docs/spec/cli-contract.md`
- `docs/guides/adding-an-integration.md`
