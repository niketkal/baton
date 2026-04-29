import type { LintRule } from '../types.js';

/**
 * BTN050 blocking_warnings_gate_dispatch
 *
 * Any warning with `blocking: true` prevents the packet from
 * becoming dispatch-eligible. Concretely: a packet that carries a
 * blocking warning may not be in `ready_for_export` or `dispatched`
 * status. Earlier statuses are allowed (the warning hasn't yet
 * gated anything irreversible).
 *
 * The rule's finding includes structured data listing the offending
 * warning codes so downstream tooling (`baton lint --json`,
 * `baton status`) can surface them without re-walking the warnings
 * array.
 */
export const BTN050: LintRule = {
  code: 'BTN050',
  severity: 'error',
  failInStrict: true,
  description: 'blocking warnings prevent ready_for_export / dispatched status',
  check(packet) {
    const status = packet.status;
    if (status !== 'ready_for_export' && status !== 'dispatched') return [];
    const blocking = packet.warnings.filter((w) => w.blocking === true);
    if (blocking.length === 0) return [];
    const codes = blocking.map((w) => w.code);
    return [
      {
        message: `Status "${status}" is gated by ${blocking.length} blocking warning(s): ${codes.join(', ')}.`,
        path: '/warnings',
        data: { status, blocking_codes: codes },
      },
    ];
  },
};
