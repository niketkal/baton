import type { BatonPacket } from '@baton/schema';

/**
 * Re-export the canonical packet type under a shorter local alias used
 * throughout the lint engine and rules.
 */
export type Packet = BatonPacket;

/**
 * Severity levels for lint findings, matching the canonical packet
 * `severity` enum from packet.schema.json.
 */
export type Severity = 'info' | 'warning' | 'error' | 'critical';

/**
 * A single lint finding. Used both as the result element from a rule's
 * `check` and as the report-level entry in `LintReport.errors` /
 * `LintReport.warnings` (the engine fills in `code` + `severity`).
 */
export interface LintFinding {
  code: string;
  severity: Severity;
  message: string;
  path?: string;
  /**
   * Optional structured payload for downstream consumers (e.g. `baton lint
   * --json`) so they don't have to regex-parse `message`. Shape is
   * rule-specific.
   */
  data?: Record<string, unknown>;
}

/**
 * Aliases of `LintFinding` purely for call-site clarity. Identical shape.
 */
export type LintError = LintFinding;
export type LintWarning = LintFinding;

/**
 * What a rule's `check` function returns: zero or more findings. The
 * engine fills in `code` from the rule and (when not provided) the rule's
 * default `severity`. The rule may override `severity` per-finding when it
 * has reason to (e.g. one rule reporting both critical and error issues).
 */
export type LintRuleResult = Array<{
  message: string;
  path?: string;
  severity?: Severity;
  data?: Record<string, unknown>;
}>;

/**
 * Read-only filesystem accessor surfaced to rules that need to verify
 * referenced paths exist (BTN012). Kept intentionally tiny so the lint
 * package never imports `node:fs` directly — callers (engine,
 * compiler, CLI) inject a sandboxed implementation. When omitted, rules
 * that depend on it become no-ops.
 */
export interface LintFsAccessor {
  existsSync(path: string): boolean;
}

/**
 * Read-only git ref resolver surfaced to rules that need to verify a
 * branch/commit resolves (BTN013). Same sandboxing rationale as
 * LintFsAccessor.
 */
export interface LintGitRefResolver {
  resolves(ref: string): boolean;
}

/**
 * Pre-computed freshness signal supplied by the compiler / freshness
 * subsystem (Session 13). When absent, BTN014 cannot make a stale
 * determination and is a no-op.
 */
export interface LintFreshnessSignal {
  stale: boolean;
  reason?: string;
}

/**
 * Context passed to every rule. Will grow over time (repo head, freshness,
 * stale thresholds, etc.); kept intentionally narrow for now.
 *
 * The optional `fs`, `gitRefs`, and `freshness` fields let rules that
 * need real I/O (BTN012/BTN013/BTN014) be exercised in Session 13
 * without further changes here. They are all `?:` so existing callers
 * that don't care about repo verification work unchanged.
 */
export interface LintContext {
  repoRoot?: string;
  strict?: boolean;
  fs?: LintFsAccessor;
  gitRefs?: LintGitRefResolver;
  freshness?: LintFreshnessSignal;
}

export interface LintRule {
  code: string;
  severity: Severity;
  failInStrict: boolean;
  description: string;
  check(packet: Packet, ctx: LintContext): LintRuleResult;
}

export interface LintReportSummary {
  blockingCount: number;
  warningCount: number;
}

/**
 * Allowed report statuses per docs/spec/lint-rules.md. Note: the
 * `'needs_clarification'` status will be produced by a later session
 * (Session 10) once open-question handling lands; for now the engine only
 * emits `'passed'` or `'failed'`.
 */
export type LintReportStatus = 'passed' | 'failed' | 'needs_clarification';

export interface LintReport {
  packetId: string;
  status: LintReportStatus;
  errors: LintFinding[];
  warnings: LintFinding[];
  summary: LintReportSummary;
}

export interface LintOptions {
  strict?: boolean;
}
