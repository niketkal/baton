import type { LintRule, PacketStatus } from '../types.js';

/**
 * BTN040 status_transition_legal
 *
 * Packet status may only change through legal transitions. The
 * canonical transition graph (per docs/spec/lint-rules.md / the
 * baton-lint-rules canonical doc):
 *
 *   draft               -> ready_for_export | needs_clarification | abandoned
 *   ready_for_export    -> awaiting_approval | dispatched | needs_clarification | abandoned
 *   awaiting_approval   -> ready_for_export | dispatched | abandoned
 *   dispatched          -> awaiting_outcome | needs_clarification | abandoned
 *   awaiting_outcome    -> completed | ready_for_export | needs_clarification | abandoned
 *   needs_clarification -> draft | ready_for_export | abandoned
 *   completed           -> (terminal)
 *   abandoned           -> (terminal)
 *
 * The rule needs the prior status to evaluate. Callers (CLI,
 * compiler, dispatch command) thread the previous version's status
 * via `LintContext.priorStatus`. When that is unset or `null` the
 * rule is a no-op — there's no signal to evaluate against.
 *
 * `priorStatus === packet.status` (no transition) is always allowed.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<PacketStatus, readonly PacketStatus[]>> =
  Object.freeze({
    draft: ['ready_for_export', 'needs_clarification', 'abandoned'],
    ready_for_export: ['awaiting_approval', 'dispatched', 'needs_clarification', 'abandoned'],
    awaiting_approval: ['ready_for_export', 'dispatched', 'abandoned'],
    dispatched: ['awaiting_outcome', 'needs_clarification', 'abandoned'],
    awaiting_outcome: ['completed', 'ready_for_export', 'needs_clarification', 'abandoned'],
    needs_clarification: ['draft', 'ready_for_export', 'abandoned'],
    completed: [],
    abandoned: [],
  });

export const BTN040: LintRule = {
  code: 'BTN040',
  severity: 'error',
  failInStrict: true,
  description: 'packet status may change only through legal transitions',
  check(packet, ctx) {
    const prior = ctx.priorStatus;
    if (prior === undefined || prior === null) return [];
    const current = packet.status as PacketStatus;
    if (current === prior) return [];
    const allowed = ALLOWED_TRANSITIONS[prior];
    if (allowed === undefined) {
      return [
        {
          message: `Unknown prior status "${prior}"; cannot evaluate transition.`,
          path: '/status',
          severity: 'warning',
        },
      ];
    }
    if (allowed.includes(current)) return [];
    return [
      {
        message: `Illegal status transition: "${prior}" -> "${current}". Allowed from "${prior}": ${
          allowed.length === 0 ? '(terminal)' : allowed.join(', ')
        }.`,
        path: '/status',
        data: { prior, current, allowed },
      },
    ];
  },
};
