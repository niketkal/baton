// Explicit one-import-per-rule registry per CLAUDE.md (no glob imports).
// Adding a rule = create the file under this folder and add one line below.
import type { LintRule } from '../types.js';
import { BTN001 } from './BTN001-schema-version-supported.js';
import { BTN002 } from './BTN002-packet-schema-valid.js';
import { BTN003 } from './BTN003-required-narrative-fields-present.js';
import { BTN004 } from './BTN004-confidence-score-bounded.js';
import { BTN010 } from './BTN010-repo-context-required-for-code-tasks.js';
import { BTN011 } from './BTN011-context-items-required-for-code-tasks.js';
import { BTN012 } from './BTN012-referenced-files-exist.js';
import { BTN013 } from './BTN013-git-refs-resolve.js';
import { BTN014 } from './BTN014-packet-not-stale.js';
import { BTN020 } from './BTN020-acceptance-criteria-required-for-execution.js';
import { BTN021 } from './BTN021-open-blocking-questions-gate-readiness.js';
import { BTN030 } from './BTN030-constraints-require-provenance.js';
import { BTN031 } from './BTN031-attempt-failures-require-evidence.js';
import { BTN032 } from './BTN032-acceptance-criteria-require-provenance.js';
import { BTN033 } from './BTN033-context-items-require-provenance.js';
import { BTN040 } from './BTN040-status-transition-legal.js';
import { BTN041 } from './BTN041-ready-requires-validation-level-ready.js';
import { BTN042 } from './BTN042-approval-policy-respected.js';
import { BTN043 } from './BTN043-dispatch-allowed-policy-respected.js';
import { BTN050 } from './BTN050-blocking-warnings-gate-dispatch.js';
import { BTN060 } from './BTN060-no-apparent-secrets-in-artifacts.js';

export const ALL_RULES: readonly LintRule[] = Object.freeze([
  BTN001,
  BTN002,
  BTN003,
  BTN004,
  BTN010,
  BTN011,
  BTN012,
  BTN013,
  BTN014,
  BTN020,
  BTN021,
  BTN030,
  BTN031,
  BTN032,
  BTN033,
  BTN040,
  BTN041,
  BTN042,
  BTN043,
  BTN050,
  BTN060,
]);

export {
  BTN001,
  BTN002,
  BTN003,
  BTN004,
  BTN010,
  BTN011,
  BTN012,
  BTN013,
  BTN014,
  BTN020,
  BTN021,
  BTN030,
  BTN031,
  BTN032,
  BTN033,
  BTN040,
  BTN041,
  BTN042,
  BTN043,
  BTN050,
  BTN060,
};
