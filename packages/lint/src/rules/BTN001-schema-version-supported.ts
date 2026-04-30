import { SCHEMA_VERSION } from '@batonai/schema';
import type { LintRule } from '../types.js';

/**
 * BTN001 schema_version_supported
 *
 * `schema_version` must equal `'baton.packet/v1'`. Critical and always
 * fails in strict mode.
 */
export const BTN001: LintRule = {
  code: 'BTN001',
  severity: 'critical',
  failInStrict: true,
  description: "schema_version must equal 'baton.packet/v1'",
  check(packet) {
    const value = (packet as { schema_version?: unknown }).schema_version;
    if (value === SCHEMA_VERSION) return [];
    return [
      {
        message: `schema_version must equal '${SCHEMA_VERSION}' (got ${
          typeof value === 'string' ? `'${value}'` : String(value)
        }).`,
        path: '/schema_version',
      },
    ];
  },
};
