# ADR 0011: External compiler sources via third-party CLIs

- Status: Accepted
- Date: 2026-05-07

## Context

Today the compiler ingests artifacts that already live on disk under
`.baton/artifacts/` (transcripts, diffs, issues, logs, notes, images,
test-reports — the `artifactType` enum in
`packages/schema/packet.schema.json`). The producer is either an
integration's hook or the user via `baton ingest`.

A new request asks Baton to consume context from another tool's
machine-readable export — specifically, a third-party CLI ("Entire") that
exposes session/checkpoint metadata and transcripts via subcommands. The
proposal in `entire-integration-dev-one-pager.md` adds a
`packages/compiler/src/sources/entire/` subtree and new compile flags
`--from entire --checkpoint <id> | --session <id> | --current-session`.

This is not the same shape as `@batonai/integrations`. Integrations
install hooks **into** a tool so the tool feeds Baton as it runs. The
Entire flow is the inverse: Baton, on demand, **pulls** from a
third-party tool that has already captured state. There is nothing to
install or uninstall, and there is no live process to wrap.

Three things make this worth an ADR rather than a silent addition:

1. It introduces a new architectural concept (external compile source)
   that future tools (e.g. other capture/recovery tools, IDE export
   commands, CI artifact stores) will want to follow. Picking the shape
   once costs less than retrofitting later.
2. It crosses two normative interfaces: the CLI contract (`baton compile`
   gains flags) and, depending on how Entire metadata is recorded, the
   packet schema (`artifactType` enum, or a new provenance kind).
3. It collides with at least one repo invariant — competitor-name policy
   — that needs an explicit ruling before any user-facing string lands.

## Decision

Introduce a new compiler-internal abstraction, `CompileSource`, that
sits **above** the existing artifact pipeline. A `CompileSource` resolves
external state into Baton-shaped artifacts plus provenance, then hands
those to the existing compile pipeline unchanged.

```ts
// packages/compiler/src/sources/types.ts
export interface CompileSource {
  id: string;                                // e.g. "entire"
  detect(): Promise<DetectResult>;           // is the upstream available?
  resolve(input: SourceInput): Promise<ResolvedSource>;
}

export interface ResolvedSource {
  // Artifacts conform to the existing `sourceArtifact` and
  // `artifactType` definitions in packet.schema.json. The source
  // sets `source_tool` to its own id (e.g. "entire") and encodes
  // upstream identity in `uri` (see "Upstream identity" below).
  artifacts: IngestedArtifact[];

  // Non-BTN, structured import-quality warnings emitted by the
  // source itself (e.g. transcript_unavailable). These are distinct
  // from lint findings produced by @batonai/lint downstream.
  importWarnings: SourceImportWarning[];
}

export interface SourceImportWarning {
  // Stable, non-BTN type prefix: "compiler.source.<short_name>"
  type: string;
  message: string;
  severity: "info" | "warn" | "error";
  context?: Record<string, unknown>;
}
```

**Source warnings are not lint findings.** BTN-coded warnings come
from `@batonai/lint` after compile, against the resulting packet.
Source warnings come from the resolve step, before lint runs, and
describe import quality (e.g. "metadata imported, transcript
unavailable; reduced compile"). The two never collide because they
flow through different pipelines and live in different fields.

Concrete sources live under `packages/compiler/src/sources/<id>/` and
register explicitly in `packages/compiler/src/sources/index.ts` — same
"explicit registration over glob import" rule as `@batonai/lint/rules/`.

Constraints any `CompileSource` must satisfy:

- **No live LLM call in `--fast`.** The 5-second `failover` budget is
  unchanged. Source `resolve()` runs subprocesses against the upstream
  CLI only; LLM-backed extraction stays in the existing `--full` path.
- **Subprocess hygiene.** Argv-only invocation (no shell). All IDs are
  validated against `^[A-Za-z0-9._-]{1,128}$` before being passed as
  argv. `stdout`/`stderr` captured separately; non-zero exit is a hard
  error in metadata mode and a degraded warning (not failure) in
  transcript mode under `--full`. A bounded timeout (default 10s,
  override via `BATON_SOURCE_TIMEOUT_MS`) applies to every spawn.
- **Detection before invocation.** `detect()` runs first; missing
  upstream binary or unsupported version yields a clear, non-network
  error pointing at the minimum required upstream version.
- **Logs hold metadata only.** `redactForLog()` continues to be the
  only path for log output. Source-resolved transcript bytes never
  enter `.baton/logs/*` at default levels (invariant #3).
- **Files canonical.** Resolved artifacts are written to
  `.baton/artifacts/` with a content digest the same way hook-driven
  artifacts are. SQLite remains a rebuildable index.

The CLI surface is composed, not source-specific. `baton compile` gains
one new flag — `--from <source-id>` — plus source-scoped flags
documented in the CLI contract. `--from` is the only source-naming
surface; downstream code reads the registry. This keeps the contract
stable as more sources land.

## Upstream identity (schema-neutral storage)

The packet schema does **not** define an arbitrary "namespaced
provenance object". The normative surfaces for upstream identity in
v1 are exactly:

- `sourceArtifact.source_tool` — open string, ≤128 chars. Set to the
  source id (e.g. `"entire"`).
- `sourceArtifact.uri` — `refPath`, ≤4096 chars. Encodes the upstream
  reference deterministically:
  - `entire://session/<session-id>` for session-scoped imports
  - `entire://session/<session-id>/checkpoint/<checkpoint-id>` for
    checkpoint-scoped imports
  - For sources that resolve a symbolic ref like `--current-session`,
    the resolved concrete ids are pinned into the `uri` at compile
    time (settled default in the cli-contract proposal).
- `provenance_links` — the existing per-field provenance mechanism.
  Each compiled packet field references back to the contributing
  `sourceArtifact` via `artifact_id`. Upstream identity is therefore
  reachable transitively without introducing new fields.

The previously-mentioned "namespaced object under `provenance.json`"
phrasing is **withdrawn**; it conflicted with the existing
`provenance_links`-serializing sidecar shape. Implementations must
not add ad-hoc keys to that sidecar.

If a future renderer or consumer needs first-class upstream-source
fields inside the packet body (e.g. a typed `external_sources` array),
that is an explicit schema-change ADR — not Phase 1.

## Resolved policy decisions

These were open questions in the draft. Resolved during ADR review on
2026-05-07:

1. **Competitor-name policy (CLAUDE.md invariant #5).** Invariant #5
   forbids competitive comparative framing in user-facing copy, not
   technical interoperability identifiers. Third-party tool names are
   permitted as source IDs, integration IDs, provider IDs, and inside
   error messages and docs **when used purely for interoperability**.
   They remain forbidden in marketing/comparison copy.
   - `entire` is blessed as a technical source ID for this work.
   - This rule generalizes to any future external compile source: a
     bare product identifier in technical surfaces is fine; "Baton
     replaces X" or "unlike X" copy is not.

2. **Schema impact.** v1 is **schema-neutral**. No change to
   `packet.schema.json` for Phase 1. All upstream data maps into
   existing `artifactType` buckets (`note`, `transcript`) and uses
   the existing `sourceArtifact.source_tool` + `sourceArtifact.uri`
   fields plus normal `provenance_links` to record upstream
   identity. See "Upstream identity" above for the exact pinning.
   No ad-hoc keys are added to the `provenance.json` sidecar.

3. **BTN warning code for transcript degrade.** Do **not** invent a
   new BTN rule yet. Degraded transcript availability is a runtime
   import-quality signal, not a normative packet rule. Phase 1 emits a
   non-BTN compiler warning into `warnings.json` with a
   structured-warning type outside the BTN namespace (e.g.
   `compiler.source.transcript_unavailable`). Promote to BTN only if
   it becomes a reusable lint invariant across multiple sources.

4. **5-second failover / fast-mode budget.** Highest real technical
   risk. Phase 1 hard rules:
   - `compile --from <source> --fast` **must** be benchmarked
     explicitly under `packages/cli/test/performance/` before any
     failover wiring.
   - No live LLM calls in fast mode (unchanged from invariant #2).
   - Transcript fetch is **forbidden** in fast mode — `--from entire
     --fast` calls only the metadata subcommand.
   - Capability/version probes (`<upstream> --version` /
     `--help`) must be cached per process (and optionally on disk
     under `.baton/cache/sources/<id>.json`) so they do not run on
     every compile.
   - **`baton failover` must not invoke `--from <source>` until the
     perf check has passed in CI.** Until then, `--from <source>` is
     a `compile`-only flag.

## Alternatives considered

- **Put Entire under `@batonai/integrations/entire/`.** Rejected —
  integrations install/uninstall a hook into a tool's lifecycle. There
  is nothing to install here; Baton just shells out to read.
  Conflating the two would force `dryRun()` and `uninstall()` to be
  no-ops, which weakens the integration contract's meaning.

- **Skip the abstraction; add Entire-specific code paths to
  `compile.ts` directly.** Rejected — the next external source (CI
  artifact store, IDE export, another capture tool) would require the
  same primitives: detect, version-gate, validated subprocess, map
  external metadata to artifacts. Building it once is cheaper than
  building it twice.

- **Read Entire's on-disk state directly** (its repo-local checkpoint
  storage). Rejected by the proposal itself, and correctly:
  Baton would couple to internal layout that has no compatibility
  guarantee. The CLI export contract is the only stable surface.

## Consequences

Positive:

- Adding a new external source is one folder under
  `packages/compiler/src/sources/<id>/` plus a registry import — same
  ergonomics as adding a lint rule or an LLM provider.
- The compile pipeline downstream of the source is unchanged. Existing
  fixtures, lint rules, and renderer snapshots keep working.
- Subprocess and timeout policy is centralized, not reinvented per
  source.

Negative:

- Adds a third "extension surface" alongside `@batonai/integrations`
  and `@batonai/llm`. Users and contributors need to learn the
  distinction (push vs pull vs synthesize). Mitigated by naming and a
  one-paragraph guide in `docs/architecture.md`.
- Subprocess invocation broadens the trust surface — a malicious
  upstream binary on `PATH` could feed the compiler. Mitigated by
  detection + version gating + timeout + treating upstream output as
  untrusted input (digest, validate JSON before mapping). Same posture
  as untrusted artifact ingestion today.

## Related

- ADR 0008 (integration modes) — contrasting "push" surface
- ADR 0002 (BYOK LLM providers) — same registry-style extension shape
- `docs/spec/cli-contract.md` — proposal diff in
  `docs/spec/proposals/cli-contract-compile-from.md`
- CLAUDE.md invariants 1, 3, 5
