import type { LintRule } from '../types.js';

/**
 * BTN004 confidence_score_bounded
 *
 * `confidence_score`, when present, must be a number in [0, 1].
 */
export const BTN004: LintRule = {
  code: 'BTN004',
  severity: 'error',
  failInStrict: true,
  description: 'confidence_score must be between 0 and 1 inclusive',
  check(packet) {
    const value = (packet as { confidence_score?: unknown }).confidence_score;
    if (value === undefined || value === null) return [];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return [
        {
          message: `confidence_score must be a number (got ${typeof value}).`,
          path: '/confidence_score',
        },
      ];
    }
    if (value < 0 || value > 1) {
      return [
        {
          message: `confidence_score must be between 0 and 1 (got ${value}).`,
          path: '/confidence_score',
        },
      ];
    }
    return [];
  },
};
