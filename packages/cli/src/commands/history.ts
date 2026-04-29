import type { Command } from 'commander';

/**
 * `baton history --packet <id> [--json]`
 *
 * Per docs/spec/cli-contract.md, surface a chronological timeline of:
 *   - packet versions (snapshots under `.baton/history/packets/<id>/v*.json`)
 *   - dispatches (filtered from `.baton/events/dispatch.jsonl`)
 *   - outcomes   (filtered from `.baton/events/outcomes.jsonl`)
 *
 * Cold-start discipline: this module's top-level imports are limited
 * to `Command` (commander, type-only). All node:fs / node:path /
 * @baton modules are imported lazily inside the handler.
 *
 * Failure mode: missing journals / history dir is treated as "no
 * events", not as an error. The packet itself is required only when
 * we surface "current" details — see the per-event documentation for
 * what the timeline includes.
 */

export type HistoryEventKind = 'version' | 'dispatch' | 'outcome';

export interface HistoryEvent {
  kind: HistoryEventKind;
  at: string;
  /** Free-form payload, kind-specific. */
  data: Record<string, unknown>;
}

export interface HistoryReport {
  packetId: string;
  events: HistoryEvent[];
  summary: {
    versionCount: number;
    dispatchCount: number;
    outcomeCount: number;
  };
}

export interface HistoryOptions {
  packet: string;
  repo?: string;
  json?: boolean;
}

interface DispatchEventRow {
  id?: string;
  packet_id?: string;
  target_tool?: string;
  adapter?: string;
  status?: string;
  destination?: string;
  created_at?: string;
}

interface OutcomeEventRow {
  id?: string;
  packet_id?: string;
  source_tool?: string;
  classification?: string;
  outcome_path?: string;
  created_at?: string;
}

/**
 * Read JSONL line-by-line, ignoring blank/malformed lines. JSON-Lines
 * is append-only; partial writes show up as a corrupt last line and
 * the rest of the file should still be readable.
 */
function readJsonl<T>(path: string, fs: { readFileSync(p: string, enc: 'utf8'): string }): T[] {
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip corrupt lines; surface a comment-style entry would lie
      // about the timestamp. Better to keep the timeline honest.
    }
  }
  return out;
}

export async function buildHistoryReport(opts: HistoryOptions): Promise<HistoryReport> {
  const { existsSync, readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const repoRoot = opts.repo ?? process.cwd();
  const packetId = opts.packet;

  // 1) Versions: .baton/history/packets/<id>/v*.json
  const versionEvents: HistoryEvent[] = [];
  const versionsDir = join(repoRoot, '.baton', 'history', 'packets', packetId);
  if (existsSync(versionsDir)) {
    let entries: string[] = [];
    try {
      entries = readdirSync(versionsDir).filter((f) => /^v\d+\.json$/.test(f));
    } catch {
      entries = [];
    }
    entries.sort((a, b) => {
      const an = Number(a.replace(/^v|\.json$/g, ''));
      const bn = Number(b.replace(/^v|\.json$/g, ''));
      return an - bn;
    });
    for (const f of entries) {
      const fullPath = join(versionsDir, f);
      let at = '';
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
        at = typeof parsed.updated_at === 'string' ? parsed.updated_at : '';
      } catch {
        // fall through; use mtime
      }
      if (at === '') {
        try {
          at = statSync(fullPath).mtime.toISOString();
        } catch {
          at = new Date(0).toISOString();
        }
      }
      versionEvents.push({
        kind: 'version',
        at,
        data: {
          file: fullPath,
          version: f.replace(/\.json$/, ''),
          status: typeof parsed.status === 'string' ? parsed.status : undefined,
          validation_level:
            typeof parsed.validation_level === 'string' ? parsed.validation_level : undefined,
        },
      });
    }
  }

  // 2) Dispatches: .baton/events/dispatch.jsonl
  const dispatchPath = join(repoRoot, '.baton', 'events', 'dispatch.jsonl');
  const dispatchRows = readJsonl<DispatchEventRow>(dispatchPath, { readFileSync }).filter(
    (r) => r.packet_id === packetId,
  );
  const dispatchEvents: HistoryEvent[] = dispatchRows.map((r) => ({
    kind: 'dispatch',
    at: r.created_at ?? '',
    data: {
      receipt_id: r.id,
      target_tool: r.target_tool,
      adapter: r.adapter,
      status: r.status,
      destination: r.destination,
    },
  }));

  // 3) Outcomes: .baton/events/outcomes.jsonl
  const outcomesPath = join(repoRoot, '.baton', 'events', 'outcomes.jsonl');
  const outcomeRows = readJsonl<OutcomeEventRow>(outcomesPath, { readFileSync }).filter(
    (r) => r.packet_id === packetId,
  );
  const outcomeEvents: HistoryEvent[] = outcomeRows.map((r) => ({
    kind: 'outcome',
    at: r.created_at ?? '',
    data: {
      outcome_id: r.id,
      source_tool: r.source_tool,
      classification: r.classification,
      outcome_path: r.outcome_path,
    },
  }));

  const events = [...versionEvents, ...dispatchEvents, ...outcomeEvents].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );

  return {
    packetId,
    events,
    summary: {
      versionCount: versionEvents.length,
      dispatchCount: dispatchEvents.length,
      outcomeCount: outcomeEvents.length,
    },
  };
}

function formatHumanTimeline(report: HistoryReport): string {
  const lines: string[] = [];
  lines.push(`history for packet ${report.packetId}`);
  lines.push(
    `  versions: ${report.summary.versionCount}` +
      `  dispatches: ${report.summary.dispatchCount}` +
      `  outcomes: ${report.summary.outcomeCount}`,
  );
  if (report.events.length === 0) {
    lines.push('  (no events recorded)');
    return `${lines.join('\n')}\n`;
  }
  for (const ev of report.events) {
    const at = ev.at === '' ? '<no-timestamp>' : ev.at;
    if (ev.kind === 'version') {
      const status = (ev.data.status as string | undefined) ?? '?';
      const vl = (ev.data.validation_level as string | undefined) ?? '?';
      const v = (ev.data.version as string | undefined) ?? '';
      lines.push(`  ${at}  version ${v}  status=${status}  validation=${vl}`);
    } else if (ev.kind === 'dispatch') {
      const target = (ev.data.target_tool as string | undefined) ?? '?';
      const adapter = (ev.data.adapter as string | undefined) ?? '?';
      const status = (ev.data.status as string | undefined) ?? '?';
      lines.push(`  ${at}  dispatch  target=${target}  adapter=${adapter}  status=${status}`);
    } else if (ev.kind === 'outcome') {
      const cls = (ev.data.classification as string | undefined) ?? '?';
      const src = (ev.data.source_tool as string | undefined) ?? '?';
      lines.push(`  ${at}  outcome   source=${src}  classification=${cls}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function runHistory(opts: HistoryOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  if (typeof opts.packet !== 'string' || opts.packet.length === 0) {
    process.stderr.write('history: --packet <id> is required\n');
    return 1;
  }
  const report = await buildHistoryReport(opts);
  if (opts.json === true) {
    const { renderJsonResult } = await import('../output/json.js');
    process.stdout.write(renderJsonResult(report));
  } else {
    process.stdout.write(formatHumanTimeline(report));
  }
  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'history',
      exit_code: 0,
      duration_ms: Date.now() - start,
      packet_id: opts.packet,
      meta: { ...report.summary },
    }),
    'command complete',
  );
  return 0;
}

export function registerHistory(program: Command): void {
  program
    .command('history')
    .description('Show packet versions, dispatches, and outcomes')
    .requiredOption('--packet <id>', 'packet id')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--json', 'machine-readable output', false)
    .action(async (raw: HistoryOptions) => {
      const code = await runHistory(raw);
      process.exitCode = code;
    });
}
