# Baton Architecture

A high-level engineering overview of how the Baton CLI is put together.

This is a public companion to the package READMEs and ADRs. It explains the
layered architecture, the canonical data flow for `baton failover`, and the
responsibilities of each `@baton/*` package. For implementation specifics,
follow the links into individual packages and ADRs.

---

## Layered architecture

Baton is a single CLI binary backed by a small monorepo of focused packages.
The dispatcher routes argv to a command, the command pulls in the layers it
needs, and each layer is independent enough to test in isolation.

```
                       ┌────────────────────────┐
                       │     CLI dispatcher     │   @baton/cli
                       └───────────┬────────────┘
                                   │
        ┌──────────────────────────┼─────────────────────────────┐
        │                          │                             │
┌───────▼────────┐  ┌──────────────▼─────────────┐  ┌────────────▼───────┐
│  integrations  │  │         compiler           │  │      adapters      │
│  (per-tool     │  │  (artifact → packet, with  │  │  (file, stdout,    │
│   hooks/wraps) │  │   --fast and --full modes) │  │  shell, clipboard) │
└───────┬────────┘  └──────┬──────────────┬──────┘  └────────┬───────────┘
        │                  │              │                  │
        │           ┌──────▼─────┐   ┌────▼─────┐            │
        │           │   schema   │   │   lint   │            │
        │           │  + types   │   │  engine  │            │
        │           └──────┬─────┘   └────┬─────┘            │
        │                  │              │                  │
        │           ┌──────▼──────────────▼─────┐            │
        │           │           store           │            │
        │           │  (.baton/ files + sqlite) │            │
        │           └──────┬────────────────────┘            │
        │                  │                                 │
        │           ┌──────▼─────┐                           │
        │           │    llm     │                           │
        │           │   (BYOK,   │                           │
        │           │ multi-prov)│                           │
        │           └────────────┘                           │
        │                                                    │
        └────────────────────────────────────────────────────┘
```

Each downward edge is a "this layer depends on that layer" relationship. No
upward dependencies; the schema and store don't know anything about the CLI
or about specific integrations.

---

## Layer responsibilities

| Layer | Responsibility | Key invariant |
|---|---|---|
| CLI dispatcher | Parse argv, route to commands, format output | Predictable exit codes; `--json` mode for every command |
| Integrations | Detect tools; install/uninstall/dry-run hooks; wrap launchers | Never modify another tool's config without explicit consent |
| Compiler | Pure transformation: artifacts + repo → candidate packet | Same inputs → same output (deterministic part); LLM calls are isolated and cacheable |
| Schema | Source-of-truth types and JSON Schema | One file per concept; CC0 license |
| Lint | BTN-rule engine + verification | Rules are pure functions over packet state; produce typed errors / warnings |
| Store | Repo-local SQLite + file storage | Files are canonical; SQLite is index/cache only |
| LLM | Provider abstraction for BYOK Anthropic / OpenAI / others | No provider-specific logic leaks into the compiler |
| Renderer | Packet → tool-specific markdown | Pure function of packet + render hints |
| Adapters | Deliver payload to destination | `prepare → deliver → poll → ingest` contract |

---

## Canonical data flow: `baton failover`

`baton failover` is the highest-value path. It runs when a developer hits a
wall — context compacted, session ended, rate limit hit — and needs to
continue in a different tool right now. The whole flow has a 5-second budget
on a warm cache and must not block on a live LLM call by default.

```
Trigger (user typed `baton failover` or hook fired)
    │
    ▼
Integration layer detects active tool, validates target tool, gathers latest
artifacts (transcript, log, diff, repo state)
    │
    ▼
Compiler ingests artifacts, normalizes them, drafts packet
(--fast by default: deterministic refresh + cached state)
(--full when explicitly requested: + LLM synthesis for objective / attempts /
acceptance / next-action)
    │
    ▼
Lint engine validates packet
(strict for dispatch; non-strict for failover speed)
    │
    ▼
Renderer emits target-specific markdown payload
(claude-code | codex | cursor | generic)
    │
    ▼
Adapter delivers payload
(stdout by default; file → BATON.md; clipboard → copy)
    │
    ▼
Outcome layer waits for the next-tool result, ingests on completion, updates
packet state.
```

Operationally, `baton failover` is the macro:

1. detect source tool and confirm target tool
2. gather current artifacts
3. `compile --fast` unless `--full` is explicitly requested
4. run non-strict lint
5. render target-specific handoff
6. deliver to stdout, clipboard, or file
7. persist packet state and warnings under `.baton/`

If context is incomplete, the command preserves a partial packet and surfaces
concrete missing-context warnings rather than faking readiness.

---

## Two compile modes

The compiler has two modes, and the choice matters for both speed and
quality.

- **`--fast`** is deterministic. It refreshes file references, git refs,
  freshness flags, and token estimates, and reuses the previous packet's
  synthesized fields from cache. It does not make a live LLM call. Hooks
  (pre-compaction, session-end, limit-warning) and `baton failover` use this
  mode by default.
- **`--full`** runs the four LLM-backed extraction steps (objective,
  attempts, acceptance criteria, next action) and overwrites the synthesized
  fields. Use it when preparing a higher-quality handoff and you can tolerate
  a slower path.

LLM completions are cached by content-addressable key (provider + model +
prompts). Cache hits in `--fast` mode skip the API call entirely.

If `--fast` is forced to make a live call (because no cache entry exists),
the local log records `fell_back_to_full: true` so the speed regression is
observable.

See ADRs [0002](adr/0002-byok-llm-providers.md) (LLM strategy) and
[0003](adr/0003-state-storage.md) (file-canonical storage).

---

## Repository layout

A single Git repository, pnpm workspaces, monorepo style.

```
baton/
├── packages/
│   ├── schema/         # @baton/schema       — packet schema + types
│   ├── lint/           # @baton/lint         — BTN rule engine
│   ├── store/          # @baton/store        — files + sqlite state
│   ├── llm/            # @baton/llm          — BYOK provider abstraction
│   ├── compiler/       # @baton/compiler     — artifact → packet
│   ├── render/         # @baton/render       — target-specific renderers
│   ├── adapters/       # @baton/adapters     — file/stdout/shell/clipboard
│   ├── integrations/   # @baton/integrations — per-tool hooks/wrappers
│   ├── conformance/    # @baton/conformance  — public test suite
│   └── cli/            # @baton/cli          — main CLI entry
├── docs/
│   ├── architecture.md             # this file
│   ├── spec/                       # CLI contract, lint rules, packet schema
│   ├── adr/                        # Architecture Decision Records
│   └── guides/                     # contributor walk-throughs
└── homebrew/
```

See ADR [0004](adr/0004-monorepo-pnpm.md) for the rationale behind the
monorepo + pnpm workspace shape.

---

## Per-package responsibilities

### `@baton/schema`

Source of truth for the packet schema and the TypeScript types derived from
it.

- `packet.schema.json` — the normative schema, CC0-licensed
- `index.ts` — re-exports the generated types, the Ajv-backed
  `validatePacket()`, and `SCHEMA_VERSION`
- `types.ts` — TypeScript types generated from the schema via
  `json-schema-to-typescript`
- `migrate.ts` + `migrations/` — schema migration runner driven by
  `baton migrate`

Schema is the source of truth; types are generated. Never hand-edit the
generated types. See ADR [0010](adr/0010-schema-license-cc0.md) for the
license split.

### `@baton/lint`

The BTN rule engine.

- `engine.ts` — `lint(packet, opts) → LintReport`
- `rules/` — one file per BTN rule, each exporting
  `{ code, severity, check, failInStrict }`
- `rules/index.ts` — registry that **explicitly imports** every rule
- `report.ts` — types for `LintReport`, `LintError`, `LintWarning`
- `secrets/` — heuristic secret detectors used by BTN060

Each rule is a pure function over the packet plus a small read-only context
(repo state, attached artifacts). No side effects. The explicit-import
registry is a deliberate trade for predictable bundling, working
tree-shaking, and a statically inspectable rule set.

### `@baton/store`

Repo-local persistence.

- Files are canonical: every packet exists as a directory under
  `.baton/packets/<id>/` with `packet.json`, `packet.md`, `warnings.json`,
  `provenance.json`, and `exports/` / `outcomes/`.
- SQLite (`state.db`) is an index and a cache, regenerable by walking the
  file tree.
- `store.ts`, `db.ts`, `files.ts`, `paths.ts`, `markdown.ts`,
  `markdown-readonly.ts`, `migrations.ts`.

This layout means `git diff` on `.baton/packets/<id>/` shows the meaningful
change, `cp -r` is a valid backup, and a missing `state.db` is recoverable.
See ADR [0003](adr/0003-state-storage.md).

### `@baton/llm`

Provider-abstracted LLM interface for BYOK use.

```typescript
interface LLMProvider {
  name: string;                        // 'anthropic' | 'openai' | …
  isConfigured(): boolean;             // checks env / config for key
  complete(opts: CompleteOptions): Promise<CompleteResult>;
  estimateTokens(text: string): number;
}
```

- `providers/anthropic.ts`, `providers/openai.ts`, `providers/none.ts`
- `registry.ts` — selects the provider based on config / env
- `cache.ts` — content-addressable cache for completions

The compiler imports the registry, never a specific provider. See ADR
[0002](adr/0002-byok-llm-providers.md).

### `@baton/compiler`

The artifact → packet pipeline.

- `pipeline.ts` — orchestrates the seven-step pipeline
- `parsers/` — one parser per artifact type (`transcript`, `log`, `diff`,
  `issue`, `note`, `image`, `test-report`)
- `extract/` — LLM-backed field extractors
- `repo.ts` — git ref resolution, dirty-state detection, sandboxed file
  existence accessor (used by BTN012/013/014 via `LintContext`)
- `freshness.ts` — stale-context detection per BTN014
- `provenance.ts` — span attribution back into source artifacts
- `modes.ts` — `--fast` (deterministic + cache) vs `--full`

### `@baton/render`

Target-specific renderers.

```typescript
interface Renderer {
  target: RenderTarget;          // 'claude-code' | 'codex' | 'cursor' | 'generic'
  render(packet: Packet, hints?: RenderHints): RenderResult;
}
```

Each target file under `targets/`. Renderers are pure functions of (packet,
hints).

### `@baton/adapters`

Delivery adapters that move a rendered packet to its destination.

```typescript
interface Adapter {
  name: string;
  prepare(packet: Packet, target: RenderTarget, opts: AdapterOpts): Promise<Payload>;
  deliver(payload: Payload): Promise<DispatchReceipt>;
  poll(receipt: DispatchReceipt): Promise<DispatchStatus>;
  ingest(result: ResultInput): Promise<Outcome>;
}
```

v1 ships `file`, `stdout`, `shell`, and `clipboard`. A `github-comment`
adapter is planned for v1.5.

### `@baton/integrations`

Per-tool hook installers and wrapper launchers.

```typescript
interface Integration {
  id: string;                       // 'claude-code' | 'codex' | 'cursor' | …
  detect(): Promise<DetectResult>;
  modes: IntegrationMode[];         // ['native-hook', 'wrapper-launcher', 'paste']
  preferredMode(): IntegrationMode;
  install(mode: IntegrationMode, opts: InstallOpts): Promise<InstallResult>;
  uninstall(): Promise<void>;
  dryRun(mode: IntegrationMode): Promise<InstallPlan>;
  status(): Promise<IntegrationStatus>;
}
```

`baton init --dry-run` returns one `InstallPlan` per detected integration so
the user can see exactly what would change before consenting. See ADR
[0008](adr/0008-tool-integration-modes.md) for the native-hook → wrapper →
paste fallback ladder.

### `@baton/conformance`

The public conformance suite. Designed to be runnable both as part of the
Baton CI and by third-party implementers who want to claim Baton-compatible
output.

- `cases/` — JSON files describing test cases (input artifacts, expected
  packet shape, expected lint result)
- `runner.ts` — runs cases against any implementation that exposes the
  standard CLI surface
- `report.ts` — produces a public report

See ADR [0009](adr/0009-conformance-as-public-asset.md).

### `@baton/cli`

User-facing entry point.

- `bin.ts` — shebang entry, sets up logger, dispatches to commands
- `commands/init.ts`, `uninstall.ts`, `compile.ts`, `failover.ts`, `lint.ts`,
  `render.ts`, `ingest.ts`, `migrate.ts`, `dispatch.ts`, `outcome.ts`,
  `status.ts`, `history.ts`, `conformance.ts`
- `commands/internal.ts` — `baton internal codex-wrap` (used by the
  `baton-codex` shim; not user-facing)
- `output/` — human and JSON renderers; `redactForLog()` lives here
- `config.ts` — loads and validates `.baton/config.toml`

Depends on every other `@baton/*` package.

---

## Key interfaces

The minimal interfaces a new contribution typically interacts with:

```typescript
// @baton/lint — adding a rule
interface LintRule {
  code: string;                                // 'BTN001' …
  severity: 'info' | 'warning' | 'error' | 'critical';
  failInStrict: boolean;
  description: string;
  check(packet: Packet, ctx: LintContext): LintRuleResult;
}

// @baton/llm — adding a provider
interface LLMProvider {
  name: string;
  isConfigured(): boolean;
  complete(opts: CompleteOptions): Promise<CompleteResult>;
  estimateTokens(text: string): number;
}

// @baton/integrations — adding an integration
interface Integration { /* see above */ }

// @baton/render — adding a target
interface Renderer { /* see above */ }
```

The four guides under [docs/guides/](guides/) walk through each.

---

## Storage layout

Repo-local state lives under `.baton/`:

```
.baton/
├── config.toml                 # human-edited
├── state.db                    # sqlite, regenerable index
├── logs/                       # local-only structured logs (pino)
├── packets/
│   └── <packet-id>/
│       ├── packet.json         # canonical, schema-conformant
│       ├── packet.md           # human-readable mirror
│       ├── warnings.json       # last lint output
│       ├── provenance.json     # span-level links to artifacts
│       ├── exports/
│       └── outcomes/
├── artifacts/                  # ingested transcripts, logs, diffs, …
├── history/                    # immutable per-version snapshots
└── integrations/installed.json # which integrations are installed and how
```

Logs hold metadata only by default. Raw artifact content, transcript spans,
prompt text, and packet narrative fields never enter logs at default levels.
A CI grep check enforces this. The only exception is
`BATON_LOG_LEVEL=debug-unsafe`, which is opt-in, prints a startup banner, and
tags every line `{ unsafe: true }`.

---

## Testing strategy

| Layer | Tool | What it covers |
|---|---|---|
| Unit | vitest | Pure functions in each package |
| Integration | vitest | Compile pipeline end-to-end with mocked LLM |
| Lint rules | vitest fixtures | Each BTN rule has known-good and known-bad fixtures |
| Renderer snapshots | vitest snapshot | Same packet → same output per target |
| End-to-end | tsx + temp dirs | `baton failover` happy path against a fake tool |
| Conformance (public) | runner | Reference cases for third-party implementers |

CI runs the matrix on Node 20 + 22 across macOS, Linux, and Windows.
Performance budgets are enforced; a regression that exceeds a budget blocks
merge until either the change is fixed or the budget is explicitly raised
with a code-owner approval.

See ADR [0006](adr/0006-testing-vitest.md).

---

## Performance budgets

Budgets are CI-enforced. The `baton failover` warm-cache budget is the
load-bearing one.

| Operation | Budget |
|---|---|
| `baton --version` cold start | < 200ms |
| `baton init` happy path | < 1s |
| `baton init --dry-run` | < 500ms |
| `baton compile --fast` | < 1s |
| `baton compile --full` | < 10s typical |
| `baton lint` | < 200ms |
| `baton render` | < 100ms |
| `baton failover` happy path | < 5s warm cache |
| `npx @baton/cli failover` cold start | < 5s on cold npm cache |

Adjusting a budget requires a code-owner approval recorded in the PR.

---

## Distribution

- **npm** is primary. `npm install -g @baton/cli` for stable use.
- **npx** for first trial: `npx @baton/cli failover ...`. The CLI is
  structured to keep cold-start fast (lazy-loaded LLM SDKs, minimal top-level
  imports).
- **Homebrew** ships shortly after the v1.0.0 npm release stabilizes. The
  formula wraps a tagged npm release and a pinned Node binary so users
  without a Node install can run Baton as a single tool.

See ADR [0007](adr/0007-distribution-npm-brew.md).

---

## What's next

Public roadmap:

- **v1.0.0** — the surface described above: `init`, `failover`,
  `compile`/`lint`/`render`/`dispatch`/`outcome`, native hook for Claude
  Code, wrapper launcher for Codex CLI, paste fallback for Cursor, every BTN
  rule (BTN001–BTN060), public conformance suite, npm distribution.
- **v1.x** — additive: more LLM providers, more integrations, improved
  extraction quality, refinements based on contributor PRs.
- **v1.5** — `github-comment` adapter, MCP and ACP adapters, additional
  target tools.

Schema breaking changes are reserved for a hypothetical v2 and would ship
with `baton migrate` support for n/n+1 readers.

---

## Further reading

- [CLI contract](spec/cli-contract.md) — every command, every flag
- [Lint rules](spec/lint-rules.md) — BTN001–BTN060
- [Packet schema](spec/packet-schema.md) — human-readable wrapper around the
  JSON Schema
- [ADRs](adr/) — recorded decisions
- [Contributor guides](guides/) — concrete walk-throughs
