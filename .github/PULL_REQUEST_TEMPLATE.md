## Summary

(What this PR does, in 1-3 sentences.)

## Related issue

(Closes #N, or "none".)

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change (explain in summary)
- [ ] Docs only
- [ ] CI / tooling
- [ ] Refactor (no behavior change)

## Test plan

- [ ] `pnpm -r test` passes locally
- [ ] `pnpm -r build` passes locally
- [ ] `pnpm biome check` passes locally

## Checklist

- [ ] **Tests:** changes are covered by tests (unit, integration, or
      conformance case)
- [ ] **Performance budget:** if this could affect a tech-spec §11
      budget (cold-start, failover, lint, render, compile), I have
      measured locally and recorded the delta in the PR description
- [ ] **No secrets or partner-identifiable content** is introduced
      (BTN060 still passes; no real customer transcripts in fixtures)
- [ ] **No competitor names** in user-facing strings (CLI output,
      error messages, README, package descriptions)
- [ ] **Schema / lint / CLI contract changes** include an ADR in
      `docs/adr/` (these are normative public interfaces)
- [ ] **Conventional commit** subject for the squash merge
      (`feat:`, `fix:`, `docs:`, `chore:`, etc.)
