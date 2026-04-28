import type { LintRule } from '../types.js';

/**
 * BTN030 constraints_require_provenance
 *
 * Every constraint must include at least one provenance reference.
 * The schema already enforces `minItems: 1` on `constraint.provenance_refs`,
 * so this rule additionally guards against schema-bypassing data and
 * surfaces the failure with a BTN030 code rather than only as a
 * BTN002 schema error.
 */
export const BTN030: LintRule = {
  code: 'BTN030',
  severity: 'error',
  failInStrict: true,
  description: 'every constraint must reference at least one provenance entry',
  check(packet) {
    const constraints = (packet as { constraints?: unknown }).constraints;
    if (!Array.isArray(constraints)) return [];

    const findings: Array<{ message: string; path?: string }> = [];
    constraints.forEach((raw, idx) => {
      if (raw === null || typeof raw !== 'object') return;
      const c = raw as { id?: unknown; provenance_refs?: unknown };
      const refs = c.provenance_refs;
      if (!Array.isArray(refs) || refs.length === 0) {
        const id = typeof c.id === 'string' ? c.id : `index ${idx}`;
        findings.push({
          message: `constraint '${id}' has no provenance_refs.`,
          path: `/constraints/${idx}/provenance_refs`,
        });
      }
    });
    return findings;
  },
};
