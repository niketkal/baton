import type { LintRule } from '../types.js';

/**
 * BTN011 context_items_required_for_code_tasks
 *
 * If `task_type` is `implementation`, `debugging`, or `review`, then
 * `context_items` must contain at least one item with
 * `kind = file | test | diff | log | issue`.
 */
const CODE_TASK_TYPES = new Set(['implementation', 'debugging', 'review']);
const QUALIFYING_KINDS = new Set(['file', 'test', 'diff', 'log', 'issue']);

export const BTN011: LintRule = {
  code: 'BTN011',
  severity: 'error',
  failInStrict: true,
  description: 'code-task packets must include at least one file/test/diff/log/issue context item',
  check(packet) {
    const taskType = (packet as { task_type?: unknown }).task_type;
    if (typeof taskType !== 'string' || !CODE_TASK_TYPES.has(taskType)) {
      return [];
    }
    const items = (packet as { context_items?: unknown }).context_items;
    if (!Array.isArray(items)) {
      return [
        {
          message: `task_type='${taskType}' requires at least one qualifying context_item (none present).`,
          path: '/context_items',
        },
      ];
    }
    const qualifies = items.some((item: unknown) => {
      if (item === null || typeof item !== 'object') return false;
      const kind = (item as { kind?: unknown }).kind;
      return typeof kind === 'string' && QUALIFYING_KINDS.has(kind);
    });
    if (qualifies) return [];
    return [
      {
        message: `task_type='${taskType}' requires at least one context_item with kind in {file,test,diff,log,issue}.`,
        path: '/context_items',
      },
    ];
  },
};
