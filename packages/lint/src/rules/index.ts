// Explicit one-import-per-rule registry per CLAUDE.md (no glob imports).
// Adding a rule = create the file under this folder and add one line below.
import type { LintRule } from '../types.js';
import { BTN001 } from './BTN001-schema-version-supported.js';
import { BTN002 } from './BTN002-packet-schema-valid.js';
import { BTN003 } from './BTN003-required-narrative-fields-present.js';
import { BTN004 } from './BTN004-confidence-score-bounded.js';
import { BTN060 } from './BTN060-no-apparent-secrets-in-artifacts.js';

export const ALL_RULES: readonly LintRule[] = Object.freeze([
  BTN001,
  BTN002,
  BTN003,
  BTN004,
  BTN060,
]);

export { BTN001, BTN002, BTN003, BTN004, BTN060 };
