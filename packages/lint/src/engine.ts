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
 * `'failed'`. The third allowed status `'needs_clarification'` is reserved
 * in the type and not yet emitted by the engine.
 *
 * Strict mode: when `opts.strict === true`, a finding from any rule whose
 * `failInStrict` is true is promoted from `warnings[]` to `errors[]`,
 * regardless of the finding's own severity. The logic is exercised by
 * lower-severity rules with `failInStrict: true` such as BTN031, BTN032,
 * BTN033, plus a synthetic-rule smoke test in `engine.test.ts`.
 */
export function lint(
  packet: Packet,
  ctx: LintContext = {},
  opts: LintOptions = {},
  rules: readonly LintRule[] = ALL_RULES,
): LintReport {
  if (packet === null || typeof packet !== 'object' || Array.isArray(packet)) {
    return {
      packetId: '<unknown>',
      status: 'failed',
      errors: [
        {
          code: 'BTN-engine',
          severity: 'critical',
          message: 'packet is not an object',
        },
      ],
      warnings: [],
      summary: { blockingCount: 1, warningCount: 0 },
    };
  }
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
        ...(f.data !== undefined ? { data: f.data } : {}),
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
