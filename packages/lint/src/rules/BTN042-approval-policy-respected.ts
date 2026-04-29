import type { LintRule } from '../types.js';

/**
 * BTN042 approval_policy_respected
 *
 * If `policy.approval_required === true`, the packet cannot be in
 * `dispatched` status until approval is granted. Approval signal is
 * threaded via `LintContext.approvalGranted` (set by the dispatch
 * command after recording an approval, or by the compiler when the
 * approving party's identity is encoded in policy.reasons).
 *
 * Behavior:
 *   - `awaiting_approval` is always allowed (it's the explicit "I'm
 *     waiting for the human" parking spot).
 *   - `dispatched` requires `approvalGranted === true` when
 *     `approval_required` is set.
 *   - All other statuses pass — pre-dispatch states aren't gated
 *     by this rule (BTN040 governs status legality separately).
 */
export const BTN042: LintRule = {
  code: 'BTN042',
  severity: 'error',
  failInStrict: true,
  description: 'policy.approval_required=true blocks dispatch until approval is recorded',
  check(packet, ctx) {
    const policy = packet.policy;
    if (policy === undefined || policy.approval_required !== true) return [];
    if (packet.status !== 'dispatched') return [];
    if (ctx.approvalGranted === true) return [];
    return [
      {
        message:
          'Packet has policy.approval_required=true but no approval has been recorded; dispatch is not permitted.',
        path: '/policy/approval_required',
      },
    ];
  },
};
