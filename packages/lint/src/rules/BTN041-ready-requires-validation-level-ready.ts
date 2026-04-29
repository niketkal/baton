import type { LintRule } from '../types.js';

/**
 * BTN041 ready_requires_validation_level_ready
 *
 * Packets in `ready_for_export` or `dispatched` status require
 * `validation_level === 'ready'`. The validation level reflects how
 * thoroughly the packet's claims have been checked; promoting a
 * packet to dispatch-eligible status without `ready` validation
 * defeats the gate.
 */
export const BTN041: LintRule = {
  code: 'BTN041',
  severity: 'error',
  failInStrict: true,
  description: 'ready_for_export / dispatched requires validation_level=ready',
  check(packet) {
    const status = packet.status;
    if (status !== 'ready_for_export' && status !== 'dispatched') return [];
    if (packet.validation_level === 'ready') return [];
    return [
      {
        message: `Status "${status}" requires validation_level "ready", got "${packet.validation_level}".`,
        path: '/validation_level',
        data: { status, validation_level: packet.validation_level },
      },
    ];
  },
};
