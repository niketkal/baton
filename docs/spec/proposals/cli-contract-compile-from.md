# Proposal: `baton compile --from <source>`

- Status: Approved with conditions (see "Phase 1 gates")
- Targets: `docs/spec/cli-contract.md` § `baton compile`
- Related ADR: `docs/adr/0011-external-compiler-sources.md`
- Date: 2026-05-07

This is a **diff proposal** against the normative CLI contract. It is
not yet merged into `cli-contract.md`. ADR 0011 resolved the policy
questions; promote this proposal text into `cli-contract.md` once the
Phase 1 perf gate (below) is met in CI.

## Phase 1 gates (must pass before promotion)

1. `compile --from entire --fast` benchmarked under
   `packages/cli/test/performance/` with the upstream binary mocked.
   Warm-cache p95 must stay inside the 5s `failover` budget. If it
   doesn't, `--from entire` is excluded from `failover` until the
   regression is fixed.
2. No live LLM call in `--fast`. Enforced by the existing test that
   asserts the LLM provider registry is not invoked on the fast path.
3. Transcript subcommand is not invoked in `--fast`. Enforced by a
   spawn-spy test in the source's unit tests.
4. Capability/version probe is cached per process (and optionally on
   disk under `.baton/cache/sources/<id>.json`).
5. `baton failover` does **not** wire `--from <source>` until gates
   1–4 are green in CI.

---

## Summary of change

Add a single new flag to `baton compile`:

```
--from <source-id>      pull artifacts from a registered external
                        compile source instead of (or in addition to)
                        local repo state and ingested artifacts
```

Plus source-scoped flags documented in a new sub-section. Initial
registered source: `entire` (blessed as a technical source ID per ADR
0011; invariant #5 covers comparative marketing copy, not
interoperability identifiers).

The existing `compile` flags (`--packet`, `--repo`, `--fast`, `--full`)
are unchanged. `--from` composes with them.

### Default behavior: attach (not replace)

`--from <source>` is **additive**:

1. Resolve upstream artifacts.
2. Write them to `.baton/artifacts/` content-addressed (digest-keyed,
   same as `baton ingest` today). Artifacts already present by digest
   are deduplicated; this is what makes repeated `--from` calls
   idempotent.
3. Attach the resolved artifacts to the named packet.
4. Run the existing compile pipeline against the packet's full
   artifact set — newly attached **plus** any artifacts already
   present from prior ingests, hooks, or `--from` runs.

This default was chosen because:

- It matches `baton ingest <type>` semantics, which also attach
  rather than replace.
- It is reproducible: the packet's `.baton/packets/<id>/` directory
  is the single source of truth for what got compiled, regardless of
  how artifacts arrived.
- Replace semantics would require destructive operations on artifacts
  the user may have hand-curated — out of scope for v1.

### Replace is not a flag

There is no `--replace` or `--exclusive` flag in v1. To compile
strictly from one source, create a new packet (`baton init` /
`baton compile --packet <new-id> --from <source> ...`). The contract
gives a clean slate exactly one way: a new packet id.

### Without `--from`

Behavior is identical to today.

## Proposed contract text (insert after current `baton compile` section)

> ### `baton compile --from <source>`
>
> `baton compile` accepts an optional `--from <source-id>` flag that
> pulls artifacts from a registered external compile source. The
> resolved artifacts are written to `.baton/artifacts/` with a content
> digest, attached to the named packet's provenance, and then fed into
> the standard compile pipeline.
>
> ```bash
> baton compile --packet <id> --from <source> [source-flags] [--fast|--full]
> ```
>
> Registered sources are discovered through
> `packages/compiler/src/sources/index.ts`. `baton compile --from
> help` lists installed sources and their flags.
>
> Failure modes:
>
> - **upstream binary not found / version too old:** hard fail before
>   compile with the minimum required version and an install pointer.
> - **upstream returns malformed JSON:** hard fail; nothing is written
>   to `.baton/artifacts/` and the packet is left untouched.
> - **upstream metadata succeeds, transcript fetch fails (`--full`
>   only):** degrade to a partial compile, write the metadata-only
>   artifacts, and emit a non-BTN compiler warning into
>   `warnings.json` with type
>   `compiler.source.transcript_unavailable`. Do not fake readiness.
>   This is an import-quality signal, not a normative lint rule; if
>   it later becomes a reusable invariant across sources, promote it
>   to BTN in a separate ADR + fixture pair.
>
> Subprocess policy applies to every source: argv-only invocation,
> bounded timeout (default 10s, override `BATON_SOURCE_TIMEOUT_MS`),
> separated stdout/stderr capture, and IDs validated against
> `^[A-Za-z0-9._-]{1,128}$` before being passed as argv.
>
> #### Source: `entire`
>
> ```bash
> baton compile --packet <id> --from entire --checkpoint <ckpt>
> baton compile --packet <id> --from entire --session <sess>
> baton compile --packet <id> --from entire --current-session
> ```
>
> Source flags:
>
> - `--checkpoint <id>` — resolve from a single checkpoint
> - `--session <id>` — resolve from a session
> - `--current-session` — resolve from the upstream's current session
>
> Exactly one of the three is required when `--from entire` is set.
>
> Mode mapping:
>
> - `--fast`: metadata only (`<upstream> ... --json`). The transcript
>   subcommand is **forbidden** in this path — enforced by tests, not
>   convention. Capability/version probes are cached per process.
> - `--full`: metadata + transcript (`<upstream> ... --transcript`).
>   Transcript bytes are written as a `transcript` artifact.
>
> Until the Phase 1 perf gate is met in CI, `baton failover` does not
> accept `--from <source>`; the flag is `compile`-only.
>
> Field mapping into existing schema fields. No schema change. No
> ad-hoc keys are added to the `provenance.json` sidecar — upstream
> identity rides on `sourceArtifact.source_tool` and
> `sourceArtifact.uri` per ADR 0011 "Upstream identity":
>
> | Upstream export field        | Baton mapping                                                                  |
> |------------------------------|--------------------------------------------------------------------------------|
> | repo path / branch / commit  | `repoContext` (existing field)                                                 |
> | session id                   | every emitted `sourceArtifact.uri` includes `entire://session/<sid>/...`       |
> | checkpoint id                | checkpoint-scoped artifacts: `entire://session/<sid>/checkpoint/<cid>`         |
> | every artifact               | `sourceArtifact.source_tool = "entire"`                                        |
> | prompts                      | one `note` artifact per prompt; provenance_links target the relevant fields    |
> | files touched                | `repoContext` hint; not a separate artifact                                    |
> | agent / model metadata       | embedded in the `note` artifact body (single "session metadata" note)          |
> | timestamps                   | `sourceArtifact.created_at`; freshness is computed downstream as today         |
> | explain metadata             | `note` artifact (narrative seed)                                               |
> | transcript bytes             | `transcript` artifact (`--full` only)                                          |

## Things this proposal deliberately does **not** do

- **Does not change the packet schema.** Upstream data lands only in
  existing schema fields: artifact bodies (`artifactType` buckets),
  `sourceArtifact.source_tool`, `sourceArtifact.uri`, and the
  existing `provenance_links` mechanism. No ad-hoc keys are added to
  the `provenance.json` sidecar. See ADR 0011 "Upstream identity"
  for the exact pinning. If a future renderer needs the raw envelope
  in-packet, that's a separate schema-change ADR.
- **Does not add a top-level `baton import` or `baton ingest <source>`
  command.** The one-pager already prefers extending `compile`; this
  proposal preserves that.
- **Does not introduce a new BTN code.** Per ADR 0011, transcript
  degrade is a non-BTN compiler warning
  (`compiler.source.transcript_unavailable`). Promote to BTN only if
  it becomes a reusable lint invariant.

## Settled defaults

- `--current-session` resolves at compile time and **pins the
  resulting concrete session/checkpoint ids into every emitted
  `sourceArtifact.uri`** (e.g.
  `entire://session/<sid>/checkpoint/<cid>`). Symbolic
  re-resolution is not supported in v1.
- Subprocess timeout default: 10s, override via
  `BATON_SOURCE_TIMEOUT_MS`.
- Composition surface: flag form (`--from <source>`), not URI
  shorthand. URI form can be added later without a contract break.
