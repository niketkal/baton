# ADR 0003: State storage — files canonical, SQLite as cache

- Status: Accepted
- Date: 2026-04-26

## Context

Baton stores per-repo state: packets, artifacts, history, integration
records, lint output, dispatch receipts, and outcomes. The store has to
serve several use cases at once:

- a developer reads `packet.md` and edits the narrative subset by hand
- `git diff` on `.baton/packets/<id>/` shows the meaningful change
- `baton history` shows immutable per-version snapshots
- queries like "list packets where status=ready_for_export" stay fast
- the layout must work on macOS, Linux, and Windows
- a missing or corrupted state file must be recoverable without losing
  data

Two obvious shapes:

- **Database canonical (SQLite as truth).** Fast queries, single file,
  but: `git diff` becomes useless, hand-editing the packet markdown isn't
  a real workflow, and a corrupted DB becomes a data-loss event.
- **Files canonical (everything is a directory tree).** Auditable,
  diffable, hand-editable, but list/filter queries get slow at scale and
  there's no obvious place to put lookup indexes.

A third option combines them: files as the source of truth, SQLite as a
**rebuildable** index over the files.

## Decision

**Files are canonical. SQLite is an index and a cache that is rebuilt by
walking the file tree if missing.**

Layout under `.baton/`:

```
.baton/
├── config.toml
├── state.db                 # rebuildable index
├── packets/
│   └── <id>/
│       ├── packet.json      # canonical, schema-conformant
│       ├── packet.md        # human-readable mirror
│       ├── warnings.json    # last lint output
│       ├── provenance.json
│       ├── exports/
│       └── outcomes/
├── artifacts/
├── history/
└── integrations/installed.json
```

Code that treats SQLite as canonical is a bug. Migrations on the SQLite
schema are forward-only and idempotent so the rebuild path stays simple.

`packet.md` is a *selectively editable* mirror: narrative fields
(`objective`, `current_state`, `next_action`, plus the text of
`acceptance_criteria`, `constraints`, and `open_questions`) round-trip
through the markdown. System-managed fields (provenance, warnings,
artifact list, confidence, the rest of `repo_context`, history) render as
read-only fenced sections. Edits inside read-only sections are detected on
`baton compile` and rejected with a clear error pointing the user back to
`packet.json`.

## Consequences

Positive:

- `git diff` and `cp -r` work as backup and review tools.
- A user can edit `packet.md` by hand without breaking the canonical
  state.
- A corrupted or missing `state.db` is a `rm state.db && baton status`
  away from full recovery.
- Hand-editing real text fields is a valid workflow; tampering with
  system-managed fields is detected.

Negative:

- Two codepaths for reads: hot reads use SQLite, but write paths must
  update both files and the index atomically. Mitigated by a write-then-
  reindex pattern with a transaction wrapper and a CI test that asserts
  rebuild equivalence.
- List/filter queries depend on the index being current. If a user
  hand-edits `packet.json`, the next CLI invocation reindexes that file
  before serving queries.
- Disk usage is slightly higher than a pure database approach, mostly the
  per-version snapshots in `history/`. Acceptable for the auditability
  win.

## Related

- ADR 0004 (monorepo with pnpm workspaces — `@batonai/store` is a
  standalone package)
- The store responsibilities in `docs/architecture.md`
