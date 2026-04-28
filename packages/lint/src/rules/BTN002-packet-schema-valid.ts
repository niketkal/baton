import { validatePacket } from '@baton/schema';
import type { LintRule, LintRuleResult } from '../types.js';

/**
 * BTN002 packet_schema_valid
 *
 * Packet must validate against packet.schema.json. Each ajv error becomes
 * a single finding with `path` set from `instancePath`.
 */
export const BTN002: LintRule = {
  code: 'BTN002',
  severity: 'critical',
  failInStrict: true,
  description: 'packet must validate against packet.schema.json',
  check(packet) {
    const result = validatePacket(packet);
    if (result.valid) return [];
    const findings: LintRuleResult = [];
    for (const err of result.errors) {
      const path = err.instancePath || '/';
      // The renderer already prefixes the `path` field; don't duplicate it
      // in the message text.
      const message = err.message ? err.message : 'failed schema validation';
      findings.push({ message, path });
    }
    if (findings.length === 0) {
      findings.push({ message: 'Packet failed schema validation.', path: '/' });
    }
    return findings;
  },
};
