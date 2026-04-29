import type { LintRule } from '../types.js';

/**
 * BTN043 dispatch_allowed_policy_respected
 *
 * If `policy.dispatch_allowed === false`, the packet cannot be in
 * `dispatched` status. This is the "kill switch" — when policy says
 * dispatch is forbidden (stale context, missing approval, manual
 * hold, etc.), no path may flip the packet to dispatched.
 *
 * The rule does not block earlier statuses; it only fires once the
 * packet has actually been moved to `dispatched`. Tooling that wants
 * to gate the move itself (e.g. `baton dispatch`) should consult
 * `policy.dispatch_allowed` directly before issuing the transition.
 */
export const BTN043: LintRule = {
  code: 'BTN043',
  severity: 'error',
  failInStrict: true,
  description: 'policy.dispatch_allowed=false forbids the dispatched status',
  check(packet) {
    const policy = packet.policy;
    if (policy === undefined || policy.dispatch_allowed !== false) return [];
    if (packet.status !== 'dispatched') return [];
    const reasons = policy.reasons ?? [];
    const detail = reasons.length > 0 ? ` Policy reasons: ${reasons.join('; ')}.` : '';
    return [
      {
        message: `policy.dispatch_allowed is false but status is "dispatched"; dispatch is not permitted.${detail}`,
        path: '/policy/dispatch_allowed',
        data: { reasons },
      },
    ];
  },
};
