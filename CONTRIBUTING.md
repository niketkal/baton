# Contributing to Baton

Thanks for considering a contribution. Baton is a small, focused CLI: the
public surface (packet schema, CLI contract, BTN lint rules, conformance
suite) is treated as a stable interface, and the rest of the codebase is
organized so that most contributions land in a single package.

## Quick start

```bash
git clone https://github.com/niketkal/baton.git
cd baton
pnpm install
pnpm -r build
pnpm -r test
```

Requirements:

- Node.js 20 LTS or 22
- pnpm 9.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- macOS, Linux, or Windows

## Development loop

```bash
# run a single package's tests
pnpm --filter @baton/lint test

# run the whole repo
pnpm -r test

# format + lint
pnpm biome check --apply

# build everything
pnpm -r build
```

CI runs `test`, `lint`, `build`, `conformance`, `performance-budget`, and
`secrets-scan` on every PR. All must pass before merge.

## Branching, commits, PRs

- Branch from `main`. Name branches `feat/...`, `fix/...`, `docs/...`,
  `chore/...`, or similar.
- Squash-merge to `main`. Linear history.
- **Conventional commits** for the squash subject:
  `feat(lint): add BTN061 validate-packet-id-format`,
  `fix(cli): handle missing transcript in failover`,
  `docs(adr): record schema license decision`.
- **Signed commits required** (`git commit -S`). Set up a GPG, SSH, or S/MIME
  signing key and configure git accordingly.
- Reference relevant issues in the PR body.

Open a draft PR early if you want feedback on direction before finishing.

## What needs an ADR

Changes to the following surfaces require an
[Architecture Decision Record](docs/adr/) in the same PR:

- the packet schema (`packages/schema/packet.schema.json`)
- the BTN lint rule set (adding, removing, changing severity, or changing
  `failInStrict`)
- the CLI contract (`docs/spec/cli-contract.md` — flags, exit codes, command
  shape)
- adding or changing a delivery adapter, integration mode, or render target
- distribution decisions (npm, brew, npx, single-binary, etc.)

ADRs follow the standard Context / Decision / Consequences format. Keep them
under 200 lines and technical. See `docs/adr/0001-language-runtime.md` for
shape.

## Common contributions

The repo ships short walk-throughs for the four most common contribution
types and the conformance suite:

- [Adding a lint rule](docs/guides/adding-a-lint-rule.md)
- [Adding an LLM provider](docs/guides/adding-an-llm-provider.md)
- [Adding a tool integration](docs/guides/adding-an-integration.md)
- [Adding a render target](docs/guides/adding-a-renderer.md)
- [Adding a conformance case](docs/guides/adding-a-conformance-case.md)

## Tests and fixtures

- Every BTN rule ships with at least one good fixture and one bad fixture
  under `packages/lint/test/fixtures/<rule-name>/`.
- New providers and integrations need unit tests and an integration test that
  uses mocks (no live API calls in CI).
- Renderers ship snapshot tests under `packages/render/test/snapshots/`.
- Performance budgets are enforced in CI. If a change moves a budget,
  measure locally first and call it out in the PR.

## Issues

- File issues at https://github.com/niketkal/baton/issues.
- Use the bug template; include `baton --version` and, where relevant,
  `baton status --json` output.
- Label `good-first-issue` and `help-wanted` issues are a good place to
  start.

## Security

Please **do not** file security issues in the public tracker. Report them via
the channel listed in `SECURITY.md` (forthcoming) or use GitHub's private
vulnerability reporting on this repo.

## Code of conduct

This project follows the Contributor Covenant. See `CODE_OF_CONDUCT.md`
(forthcoming).

## License

By submitting a PR you agree your contribution is licensed under
Apache-2.0 for code or CC0 1.0 for schema and normative examples, matching
the repo licenses.
