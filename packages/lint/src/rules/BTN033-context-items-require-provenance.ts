import type { LintRule } from '../types.js';

/**
 * BTN033 context_items_require_provenance
 *
 * High-priority context items (`priority >= 4`) should point to at
 * least one provenance link via `provenance_refs`. Warning by
 * default; promoted to a strict-mode failure.
 */
const HIGH_PRIORITY_THRESHOLD = 4;

export const BTN033: LintRule = {
  code: 'BTN033',
  severity: 'warning',
  failInStrict: true,
  description: 'high-priority context items should cite provenance',
  check(packet) {
    const items = (packet as { context_items?: unknown }).context_items;
    if (!Array.isArray(items)) return [];

    const findings: Array<{ message: string; path?: string }> = [];
    items.forEach((raw, idx) => {
      if (raw === null || typeof raw !== 'object') return;
      const item = raw as {
        ref?: unknown;
        priority?: unknown;
        provenance_refs?: unknown;
      };
      if (typeof item.priority !== 'number' || item.priority < HIGH_PRIORITY_THRESHOLD) return;
      const refs = item.provenance_refs;
      if (!Array.isArray(refs) || refs.length === 0) {
        const ref = typeof item.ref === 'string' ? item.ref : `index ${idx}`;
        findings.push({
          message: `high-priority context_item '${ref}' (priority=${item.priority}) has no provenance_refs.`,
          path: `/context_items/${idx}/provenance_refs`,
        });
      }
    });
    return findings;
  },
};
