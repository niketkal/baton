# Contributing to Baton

Baton is in early development. Contribution guidelines are placeholder until v1.

## Quick start

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Requirements: Node 20+, pnpm 9.x.

## Workflow (sketch — to be expanded)

- Fork, branch, PR. Squash-merge to `main`.
- Conventional commits: `feat(lint): add BTN061 ...`
- Signed commits required.
- All PRs run CI (`test`, `lint`, `build`, `conformance`, `secrets-scan`).
- Schema, lint rules, and CLI contract are normative public interfaces — changes require an ADR and core-team review.

## Reporting issues

Use GitHub Issues. For security, see [SECURITY.md](SECURITY.md) (forthcoming).
