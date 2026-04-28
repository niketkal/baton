import { detectSecrets } from '@baton/lint';

/**
 * Allowed metadata fields that may be logged at default log levels.
 *
 * Per tech spec §12.2.1, logs hold metadata only — no raw artifact
 * content, no transcript spans, no prompt text, no packet narrative
 * fields. This type encodes the contract: every field below is a
 * counted, hashed, classified, or already-public value.
 *
 * Adding a field here is a deliberate change to the redaction
 * contract; reviewers should treat it like an ADR-adjacent decision.
 */
export interface LoggableMetadata {
  command?: string;
  subcommand?: string;
  mode?: 'fast' | 'full';
  exit_code?: number;
  duration_ms?: number;
  packet_id?: string;
  artifact_id?: string;
  artifact_type?: string;
  path?: string;
  paths?: string[];
  size_bytes?: number;
  digest?: string;
  digests?: string[];
  llm_provider?: string;
  llm_calls_live?: number;
  llm_calls_cached?: number;
  tokens_in?: number;
  tokens_out?: number;
  estimated_cost_usd_min?: number;
  estimated_cost_usd_max?: number;
  fell_back_to_full?: boolean;
  rule_code?: string;
  rule_codes?: string[];
  severity?: 'info' | 'warning' | 'error' | 'critical';
  blocking?: boolean;
  count?: number;
  counts?: Record<string, number>;
  shape?: Record<string, number>;
  git_branch?: string;
  git_commit?: string;
  target?: string;
  unsafe?: boolean;
  meta?: Record<string, string | number | boolean | null>;
}

/**
 * Escape hatch for unsafe debug mode. Every other call site must omit
 * this field; including it outside `debug-unsafe` mode causes
 * `redactForLog` to throw, which the lint-logs CI check reinforces.
 */
export interface UnsafeRawPayload {
  raw: string;
  unsafe?: never;
}

const ALLOWED_KEYS = new Set<keyof LoggableMetadata>([
  'command',
  'subcommand',
  'mode',
  'exit_code',
  'duration_ms',
  'packet_id',
  'artifact_id',
  'artifact_type',
  'path',
  'paths',
  'size_bytes',
  'digest',
  'digests',
  'llm_provider',
  'llm_calls_live',
  'llm_calls_cached',
  'tokens_in',
  'tokens_out',
  'estimated_cost_usd_min',
  'estimated_cost_usd_max',
  'fell_back_to_full',
  'rule_code',
  'rule_codes',
  'severity',
  'blocking',
  'count',
  'counts',
  'shape',
  'git_branch',
  'git_commit',
  'target',
  'unsafe',
  'meta',
]);

export type SafeLoggable = Record<string, unknown>;

const REDACTED = '[REDACTED]';

function isUnsafeMode(): boolean {
  return (process.env.BATON_LOG_LEVEL ?? '').toLowerCase() === 'debug-unsafe';
}

function scrubString(value: string): string {
  // Strip BTN060-flagged values from any string. Even though the
  // typed surface is metadata-only, defense-in-depth: a path or rule
  // code that somehow contains a secret prefix gets redacted before
  // hitting the log.
  const matches = detectSecrets(value);
  if (matches.length === 0) return value;
  let out = value;
  const ordered = [...matches].sort((a, b) => b.offset - a.offset);
  for (const m of ordered) {
    out = `${out.slice(0, m.offset)}${REDACTED}${out.slice(m.offset + m.length)}`;
  }
  return out;
}

function scrubLeafValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubLeafValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = scrubLeafValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Convert caller-supplied metadata into a SafeLoggable payload that
 * obeys the redaction contract from CLAUDE.md invariant 3 / tech
 * spec §12.2.1.
 *
 * Behavior:
 * - Unknown keys throw — only the typed metadata surface is allowed.
 * - The `{ raw: ... }` escape hatch is rejected unless
 *   `BATON_LOG_LEVEL=debug-unsafe` is set.
 * - Any string field is scrubbed for BTN060-flagged values
 *   (defense-in-depth; the typed surface should already be free of
 *   secret-bearing strings).
 */
export function redactForLog(value: LoggableMetadata | UnsafeRawPayload): SafeLoggable {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('redactForLog requires a metadata object');
  }
  if ('raw' in value && (value as UnsafeRawPayload).raw !== undefined) {
    if (!isUnsafeMode()) {
      throw new Error('redactForLog rejected { raw } payload outside BATON_LOG_LEVEL=debug-unsafe');
    }
    const r = (value as UnsafeRawPayload).raw;
    return { unsafe: true, raw: typeof r === 'string' ? r : String(r) };
  }

  const out: SafeLoggable = {};
  for (const [k, v] of Object.entries(value)) {
    if (!ALLOWED_KEYS.has(k as keyof LoggableMetadata)) {
      throw new Error(`redactForLog rejected unknown metadata field: ${k}`);
    }
    if (v === undefined) continue;
    out[k] = scrubLeafValue(v);
  }
  return out;
}
