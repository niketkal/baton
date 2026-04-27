import type { LintRule, LintRuleResult } from '../types.js';

/**
 * BTN003 required_narrative_fields_present
 *
 * `objective`, `current_state`, and `next_action` must be non-empty.
 * Empty/whitespace-only strings count as missing.
 */
const REQUIRED_FIELDS = ['objective', 'current_state', 'next_action'] as const;

export const BTN003: LintRule = {
  code: 'BTN003',
  severity: 'error',
  failInStrict: true,
  description: 'objective, current_state, and next_action must be non-empty',
  check(packet) {
    const findings: LintRuleResult = [];
    const p = packet as unknown as Record<string, unknown>;
    for (const field of REQUIRED_FIELDS) {
      const value = p[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        findings.push({
          message: `Required narrative field '${field}' is missing or empty.`,
          path: `/${field}`,
        });
      }
    }
    return findings;
  },
};
