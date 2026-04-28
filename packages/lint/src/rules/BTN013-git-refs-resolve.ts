import type { LintRule } from '../types.js';

/**
 * BTN013 git_refs_resolve
 *
 * `repo_context.branch`, `repo_context.commit`, and
 * `repo_context.base_commit` must resolve when present.
 *
 * Implementation note: git access is brokered via `ctx.gitRefs`
 * (LintGitRefResolver) which the compiler/CLI inject in Session 13.
 * When `ctx.gitRefs` is absent the rule is a no-op so packet
 * authoring remains usable.
 */
const REF_FIELDS = ['branch', 'commit', 'base_commit'] as const;

export const BTN013: LintRule = {
  code: 'BTN013',
  severity: 'error',
  failInStrict: true,
  description: 'repo_context branch/commit/base_commit must resolve when present',
  check(packet, ctx) {
    if (!ctx.gitRefs) return [];
    const repo = (packet as { repo_context?: Record<string, unknown> }).repo_context;
    if (!repo || typeof repo !== 'object') return [];

    const findings: Array<{ message: string; path?: string }> = [];
    for (const field of REF_FIELDS) {
      const value = repo[field];
      if (typeof value !== 'string' || value.length === 0) continue;
      if (!ctx.gitRefs.resolves(value)) {
        findings.push({
          message: `repo_context.${field}='${value}' does not resolve in the local repo.`,
          path: `/repo_context/${field}`,
        });
      }
    }
    return findings;
  },
};
