import type { LintRule } from '../types.js';

/**
 * BTN014 packet_not_stale
 *
 * If the repo head moved beyond configured stale thresholds after
 * packet compilation, the packet is stale.
 *
 * Implementation note: stale-detection requires repo + freshness
 * subsystems (Session 13). When `ctx.freshness` is absent the rule
 * is a no-op. When present and `stale === true`, fire a critical
 * finding with the supplied `reason` (if any).
 */
export const BTN014: LintRule = {
  code: 'BTN014',
  severity: 'critical',
  failInStrict: true,
  description: 'packet must not be stale against current repo head',
  check(_packet, ctx) {
    const freshness = ctx.freshness;
    if (!freshness || freshness.stale !== true) return [];
    const reason = freshness.reason ? ` (${freshness.reason})` : '';
    return [
      {
        message: `Packet is stale against current HEAD${reason}.`,
        path: '/repo_context',
      },
    ];
  },
};
