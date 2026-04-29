# Security Policy

## Reporting a Vulnerability

**Please do not file public GitHub issues for security problems.**

Report security vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/niketkal/baton/security/advisories/new)
on this repository.

We will:

- Acknowledge receipt within 72 hours
- Investigate and confirm or rule out the issue within 7 days
- Coordinate disclosure with you on a 90-day timeline (faster if a fix
  is straightforward; longer if cross-vendor coordination is needed)

## Scope

In scope:

- The `@baton/*` npm packages
- The `baton` CLI binary
- The packet schema and lint rules (if a rule's logic enables an
  injection or bypass)
- The repo's CI configuration

Out of scope:

- Issues in third-party LLM provider APIs (Anthropic, OpenAI, etc.) —
  report those to the provider directly
- Issues in transitive npm dependencies — report to the upstream
  package; we'll bump our pinned version once a fix is available
- Issues that require physical access to a developer's machine
- Theoretical attacks against `BATON_LOG_LEVEL=debug-unsafe` (this
  mode is explicitly opt-in and warns the user that contents may be
  sensitive)

## Coordinated Disclosure

If you've found something, please give us a chance to fix it before
making it public. We'll credit you in the release notes if you'd like.

## Hardening Already in Place

- BTN060 lint rule scrubs apparent secrets from packets before render
  or dispatch
- Logs are redacted by default; raw artifact content only enters logs
  under `BATON_LOG_LEVEL=debug-unsafe` (opt-in, banner-warned, tagged)
- Releases use OIDC trusted publishing to npm with provenance
  attestation; no long-lived `NPM_TOKEN` lives in the repo
- All commits to `main` require signed-commit verification
- Branch protection requires CI to pass + 1 review before merge
- The packet schema and lint rule files require a code-owner approval
