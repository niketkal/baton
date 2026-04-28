import type { LintRule } from '../types.js';

/**
 * BTN020 acceptance_criteria_required_for_execution
 *
 * If `task_type` is `implementation`, `debugging`, or `review`, then
 * `acceptance_criteria` must contain at least one required item
 * (i.e. an entry with `required = true`).
 */
const CODE_TASK_TYPES = new Set(['implementation', 'debugging', 'review']);

export const BTN020: LintRule = {
  code: 'BTN020',
  severity: 'error',
  failInStrict: true,
  description: 'code-task packets need at least one required acceptance criterion',
  check(packet) {
    const taskType = (packet as { task_type?: unknown }).task_type;
    if (typeof taskType !== 'string' || !CODE_TASK_TYPES.has(taskType)) {
      return [];
    }
    const criteria = (packet as { acceptance_criteria?: unknown }).acceptance_criteria;
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return [
        {
          message: `task_type='${taskType}' requires at least one required acceptance_criteria entry (none present).`,
          path: '/acceptance_criteria',
        },
      ];
    }
    const hasRequired = criteria.some((c: unknown) => {
      if (c === null || typeof c !== 'object') return false;
      return (c as { required?: unknown }).required === true;
    });
    if (hasRequired) return [];
    return [
      {
        message: `task_type='${taskType}' requires at least one acceptance_criteria entry with required=true.`,
        path: '/acceptance_criteria',
      },
    ];
  },
};
