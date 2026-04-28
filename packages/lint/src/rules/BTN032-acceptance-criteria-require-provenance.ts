import type { LintRule } from '../types.js';

/**
 * BTN032 acceptance_criteria_require_provenance
 *
 * Acceptance criteria sourced from `user` or `ticket` should include
 * provenance references. Derived criteria are exempt (they typically
 * lack a single citable source). Warning by default; promoted to a
 * strict-mode failure.
 */
const SOURCED_FROM = new Set(['user', 'ticket']);

export const BTN032: LintRule = {
  code: 'BTN032',
  severity: 'warning',
  failInStrict: true,
  description: 'user/ticket-sourced acceptance criteria should cite provenance',
  check(packet) {
    const criteria = (packet as { acceptance_criteria?: unknown }).acceptance_criteria;
    if (!Array.isArray(criteria)) return [];

    const findings: Array<{ message: string; path?: string }> = [];
    criteria.forEach((raw, idx) => {
      if (raw === null || typeof raw !== 'object') return;
      const c = raw as { id?: unknown; source?: unknown; provenance_refs?: unknown };
      if (typeof c.source !== 'string' || !SOURCED_FROM.has(c.source)) return;
      const refs = c.provenance_refs;
      if (!Array.isArray(refs) || refs.length === 0) {
        const id = typeof c.id === 'string' ? c.id : `index ${idx}`;
        findings.push({
          message: `acceptance_criterion '${id}' (source='${c.source}') has no provenance_refs.`,
          path: `/acceptance_criteria/${idx}/provenance_refs`,
        });
      }
    });
    return findings;
  },
};
