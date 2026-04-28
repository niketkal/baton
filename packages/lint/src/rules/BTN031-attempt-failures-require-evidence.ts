import type { LintRule } from '../types.js';

/**
 * BTN031 attempt_failures_require_evidence
 *
 * Any attempt with `result = failed` should reference at least one
 * supporting artifact via `artifact_refs`. Warning by default;
 * promoted to a strict-mode failure.
 */
export const BTN031: LintRule = {
  code: 'BTN031',
  severity: 'warning',
  failInStrict: true,
  description: 'failed attempts should cite at least one supporting artifact',
  check(packet) {
    const attempts = (packet as { attempts?: unknown }).attempts;
    if (!Array.isArray(attempts)) return [];

    const findings: Array<{ message: string; path?: string }> = [];
    attempts.forEach((raw, idx) => {
      if (raw === null || typeof raw !== 'object') return;
      const a = raw as { id?: unknown; result?: unknown; artifact_refs?: unknown };
      if (a.result !== 'failed') return;
      const refs = a.artifact_refs;
      if (!Array.isArray(refs) || refs.length === 0) {
        const id = typeof a.id === 'string' ? a.id : `index ${idx}`;
        findings.push({
          message: `failed attempt '${id}' has no artifact_refs evidencing the failure.`,
          path: `/attempts/${idx}/artifact_refs`,
        });
      }
    });
    return findings;
  },
};
