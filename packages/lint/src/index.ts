export { lint } from './engine.js';
export { ALL_RULES, BTN001, BTN002, BTN003, BTN004, BTN060 } from './rules/index.js';
export { detectSecrets, type SecretMatch, type SecretMatchKind } from './secrets/detect.js';
export { SECRET_PREFIXES } from './secrets/prefixes.js';
export type {
  LintContext,
  LintError,
  LintFinding,
  LintFreshnessSignal,
  LintFsAccessor,
  LintGitRefResolver,
  LintOptions,
  LintReport,
  LintReportStatus,
  LintReportSummary,
  LintRule,
  LintRuleResult,
  LintWarning,
  PacketStatus,
  Packet,
  Severity,
} from './types.js';
export { ALLOWED_TRANSITIONS } from './rules/BTN040-status-transition-legal.js';
