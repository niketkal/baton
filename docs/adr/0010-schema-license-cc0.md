# ADR 0010: Schema license — CC0, separate from code's Apache-2.0

- Status: Accepted
- Date: 2026-04-26

## Context

The Baton packet schema (`packages/schema/packet.schema.json`) is the
load-bearing public contract. For it to function as a shared format, any
tool — open source, closed source, internal, commercial — has to be able
to read or write Baton packets without legal friction.

The CLI source code is a separate concern. It benefits from a permissive
but copyleft-aware license that protects contributors and users while
allowing commercial use.

Three approaches considered:

- **Single license for everything (Apache-2.0).** Simplifies the LICENSE
  picture, but Apache-2.0 imposes attribution and patent-grant
  obligations on anyone who emits a Baton packet, which is a friction
  point for tools that just want to write JSON in a known shape.
- **Single license for everything (MIT).** Same friction in milder form.
- **Split: code under a permissive OSS license, schema under a public-
  domain dedication (CC0).** Removes friction on schema implementation
  entirely. Tools writing or reading packets owe nothing to anyone.

CC0 is the public-domain-equivalent dedication maintained by Creative
Commons. It is widely understood, has a documented fallback license for
jurisdictions that do not recognize public-domain dedication, and is
already used by other shared schemas (e.g. JSON Schema's own meta-schema
is permissively licensed in this style).

## Decision

- **Source code:** Apache-2.0 — see `LICENSE`.
- **Packet schema and normative examples:** CC0 1.0 Universal — see
  `LICENSE-SCHEMA`.

Files covered by `LICENSE-SCHEMA`:

- `packages/schema/packet.schema.json`
- normative examples in `docs/spec/packet-schema.md`
- any future normative example fixtures explicitly tagged as schema-
  examples

Everything else in the repo is Apache-2.0.

The repo's top-level `README.md` states the split. Each license file is
present at the repo root.

## Consequences

Positive:

- Any tool can implement the packet format without attribution or
  patent-grant obligations.
- "Baton-compatible" becomes a claim a vendor can make based on the
  conformance suite (ADR 0009), not a license question.
- Schema migrations and example fixtures inherit the same CC0 status by
  being normative artifacts.
- Apache-2.0 on the code base gives users a patent grant and is widely
  acceptable for commercial integration of the CLI.

Negative:

- Two licenses means two LICENSE files and a small amount of explanatory
  copy in `README.md` and `CONTRIBUTING.md`. The clarity is worth the
  extra paragraph.
- CC0 is not universally recognized in every jurisdiction; the CC0
  fallback license clauses cover this case.
- Contributors have to be told once which license their contribution
  falls under (code → Apache-2.0; schema/normative example →
  CC0). Documented in `CONTRIBUTING.md`.

## Related

- ADR 0009 (conformance suite as a public asset — depends on the schema
  being implementable without license friction)
- `LICENSE`, `LICENSE-SCHEMA`
- `CONTRIBUTING.md` (license note for contributors)
