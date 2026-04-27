# Baton

A CLI-first task-state runtime for handing off in-flight work between AI coding tools without losing context.

> Early development. Not yet stable.

Baton compiles transcripts, logs, diffs, and tickets into a structured, lint-validated "packet" that the next tool can consume.

## Status

Pre-v1. Public surface (schema, CLI contract, lint rules) is being scaffolded. Don't depend on this yet.

## License

- Source code: Apache-2.0 (see [LICENSE](LICENSE))
- Packet schema (`packages/schema/packet.schema.json`) and normative examples: CC0 1.0 (see [LICENSE-SCHEMA](LICENSE-SCHEMA))
