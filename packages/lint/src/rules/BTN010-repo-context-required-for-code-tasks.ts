import type { LintRule } from '../types.js';

/**
 * BTN010 repo_context_required_for_code_tasks
 *
 * If `task_type` is `implementation`, `debugging`, or `review`, then
 * `repo_context.attached` must be `true`.
 */
const CODE_TASK_TYPES = new Set(['implementation', 'debugging', 'review']);

export const BTN010: LintRule = {
  code: 'BTN010',
  severity: 'error',
  failInStrict: true,
  description: 'code-task packets must have an attached repo_context',
  check(packet) {
    const taskType = (packet as { task_type?: unknown }).task_type;
    if (typeof taskType !== 'string' || !CODE_TASK_TYPES.has(taskType)) {
      return [];
    }
    const repo = (packet as { repo_context?: { attached?: unknown } }).repo_context;
    if (repo?.attached === true) return [];
    return [
      {
        message: `task_type='${taskType}' requires repo_context.attached=true (got ${
          repo?.attached === undefined ? 'undefined' : String(repo.attached)
        }).`,
        path: '/repo_context/attached',
      },
    ];
  },
};
