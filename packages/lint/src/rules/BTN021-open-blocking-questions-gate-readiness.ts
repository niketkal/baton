import type { LintRule } from '../types.js';

/**
 * BTN021 open_blocking_questions_gate_readiness
 *
 * A packet with any `open_questions` where `blocking = true` and
 * `status = open` cannot be `ready`. We interpret "ready" liberally
 * here: a packet whose `validation_level === 'ready'` or whose
 * `status` is one of the post-draft execution states
 * (`ready_for_export`, `awaiting_approval`, `dispatched`,
 * `awaiting_outcome`) cannot have any open blocking question.
 */
const READY_STATUSES = new Set([
  'ready_for_export',
  'awaiting_approval',
  'dispatched',
  'awaiting_outcome',
]);

export const BTN021: LintRule = {
  code: 'BTN021',
  severity: 'error',
  failInStrict: true,
  description: 'a ready packet cannot have any open blocking questions',
  check(packet) {
    const validationLevel = (packet as { validation_level?: unknown }).validation_level;
    const status = (packet as { status?: unknown }).status;
    const isReady =
      validationLevel === 'ready' || (typeof status === 'string' && READY_STATUSES.has(status));
    if (!isReady) return [];

    const questions = (packet as { open_questions?: unknown }).open_questions;
    if (!Array.isArray(questions)) return [];

    const findings: Array<{ message: string; path?: string }> = [];
    questions.forEach((raw, idx) => {
      if (raw === null || typeof raw !== 'object') return;
      const q = raw as { blocking?: unknown; status?: unknown; id?: unknown };
      if (q.blocking === true && q.status === 'open') {
        const id = typeof q.id === 'string' ? q.id : `index ${idx}`;
        findings.push({
          message: `open_question '${id}' is blocking and still open; packet cannot be ready.`,
          path: `/open_questions/${idx}`,
        });
      }
    });
    return findings;
  },
};
