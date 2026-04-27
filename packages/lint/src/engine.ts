import { ALL_RULES } from './rules/index.js';
import type {
  LintContext,
  LintFinding,
  LintOptions,
  LintReport,
  LintRule,
  Packet,
  Severity,
} from './types.js';

/**
 * Run every registered rule against `packet` and return a structured
 * report.
 *
 * Status semantics: presently `'passed'` if `errors[]` is empty, else
 * `'failed'`. The third allowed status `'needs_clarification'` will be
 * produced by Session 10 once open-question gating lands.
 *
 * Strict mode: when `opts.strict === true`, a finding from any rule whose
 * `failInStrict` is true is promoted from `warnings[]` to `errors[]`,
 * regardless of the finding's own severity. None of the five rules in
 * this initial set are `warning`-severity-with-`failInStrict:true`, so
 * promotion is a no-op for them; the logic is exercised in Session 10
 * where lower-severity rules with `failInStrict: true` (e.g. BTN031)
 * land. The smoke test in `engine.test.ts` covers it via a synthetic
 * rule.
 */
export function lint(
  packet: Packet,
  ctx: LintContext = {},
  opts: LintOptions = {},
  rules: readonly LintRule[] = ALL_RULES,
): LintReport {
  const strict = opts.strict === true;
  const errors: LintFinding[] = [];
  const warnings: LintFinding[] = [];

  for (const rule of rules) {
    let raw: ReturnType<LintRule['check']>;
    try {
      raw = rule.check(packet, { ...ctx, strict });
    } catch (err) {
      errors.push({
        code: rule.code,
        severity: 'critical',
        message: `Rule ${rule.code} threw during evaluation: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      continue;
    }

    for (const f of raw) {
      const severity: Severity = f.severity ?? rule.severity;
      const finding: LintFinding = {
        code: rule.code,
        severity,
        message: f.message,
        ...(f.path !== undefined ? { path: f.path } : {}),
      };
      const isError = severity === 'error' || severity === 'critical';
      if (isError || (strict && rule.failInStrict)) {
        errors.push(finding);
      } else {
        warnings.push(finding);
      }
    }
  }

  return {
    packetId: typeof packet?.id === 'string' ? packet.id : '',
    status: errors.length > 0 ? 'failed' : 'passed',
    errors,
    warnings,
    summary: {
      blockingCount: errors.length,
      warningCount: warnings.length,
    },
  };
}
