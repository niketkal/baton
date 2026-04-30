import type { Command } from 'commander';

/**
 * `baton status [--packet <id>] [--json]`
 *
 * Per docs/spec/cli-contract.md:
 *   - With `--packet`: print that packet's current status,
 *     validation_level, latest dispatch (if any), latest outcome
 *     (if any), and any active warnings (e.g. BTN014 stale).
 *   - Without `--packet`: list every known packet with id, status,
 *     validation_level, and last-modified timestamp.
 *
 * Cold-start discipline: top-level imports are limited to the
 * commander type. `@batonai/store` (which transitively pulls
 * better-sqlite3) and node:fs/node:path are imported lazily inside
 * the handler.
 *
 * The store is the source of truth for "current" packet state. The
 * latest dispatch / outcome timestamps come from the JSONL event
 * journals (`.baton/events/{dispatch,outcomes}.jsonl`); both are
 * append-only and rebuildable from the per-packet directories, so
 * "no events" is reported, never an error.
 */

export interface StatusWarningSummary {
  code: string;
  severity: string;
  message: string;
  blocking: boolean;
}

export interface StatusPacketSummary {
  id: string;
  title: string;
  status: string;
  validation_level: string;
  task_type: string;
  warning_count: number;
  blocking_warning_count: number;
  updated_at: string;
}

export interface StatusDispatchSummary {
  receipt_id?: string | undefined;
  target_tool?: string | undefined;
  adapter?: string | undefined;
  status?: string | undefined;
  destination?: string | undefined;
  created_at?: string | undefined;
}

export interface StatusOutcomeSummary {
  outcome_id?: string | undefined;
  source_tool?: string | undefined;
  classification?: string | undefined;
  created_at?: string | undefined;
}

export interface StatusPacketDetail extends StatusPacketSummary {
  latestDispatch?: StatusDispatchSummary;
  latestOutcome?: StatusOutcomeSummary;
  activeWarnings: StatusWarningSummary[];
}

export interface StatusReportSingle {
  kind: 'packet';
  packet: StatusPacketDetail;
}

export interface StatusReportList {
  kind: 'list';
  packets: StatusPacketSummary[];
}

export type StatusReport = StatusReportSingle | StatusReportList;

export interface StatusOptions {
  packet?: string;
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
  created_at?: string;
}

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
      // skip
    }
  }
  return out;
}

export async function buildStatusReport(opts: StatusOptions): Promise<StatusReport> {
  const { join } = await import('node:path');
  const { readFileSync } = await import('node:fs');
  const { PacketStore } = await import('@batonai/store');
  const repoRoot = opts.repo ?? process.cwd();
  const batonDir = join(repoRoot, '.baton');
  const store = PacketStore.open(repoRoot);
  try {
    if (opts.packet === undefined || opts.packet === '') {
      const packets = store.list().map<StatusPacketSummary>((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        validation_level: s.validation_level,
        task_type: s.task_type,
        warning_count: s.warning_count,
        blocking_warning_count: s.blocking_warning_count,
        updated_at: s.updated_at,
      }));
      packets.sort((a, b) =>
        a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0,
      );
      return { kind: 'list', packets };
    }

    const id = opts.packet;
    if (!store.has(id)) {
      throw new Error(`unknown packet: ${id}`);
    }
    const packet = store.read(id);
    const summary: StatusPacketSummary = {
      id: packet.id,
      title: packet.title,
      status: packet.status,
      validation_level: packet.validation_level,
      task_type: packet.task_type,
      warning_count: packet.warnings.length,
      blocking_warning_count: packet.warnings.filter((w) => w.blocking).length,
      updated_at: packet.updated_at,
    };
    const activeWarnings: StatusWarningSummary[] = packet.warnings.map((w) => ({
      code: w.code,
      severity: w.severity,
      message: w.message,
      blocking: w.blocking,
    }));

    // Latest dispatch / outcome from event journals.
    const dispatchPath = join(batonDir, 'events', 'dispatch.jsonl');
    const outcomesPath = join(batonDir, 'events', 'outcomes.jsonl');
    const dispatchRows = readJsonl<DispatchEventRow>(dispatchPath, { readFileSync }).filter(
      (r) => r.packet_id === id,
    );
    const outcomeRows = readJsonl<OutcomeEventRow>(outcomesPath, { readFileSync }).filter(
      (r) => r.packet_id === id,
    );
    dispatchRows.sort((a, b) =>
      (a.created_at ?? '') < (b.created_at ?? '')
        ? -1
        : (a.created_at ?? '') > (b.created_at ?? '')
          ? 1
          : 0,
    );
    outcomeRows.sort((a, b) =>
      (a.created_at ?? '') < (b.created_at ?? '')
        ? -1
        : (a.created_at ?? '') > (b.created_at ?? '')
          ? 1
          : 0,
    );
    const latestDispatchRow = dispatchRows[dispatchRows.length - 1];
    const latestOutcomeRow = outcomeRows[outcomeRows.length - 1];

    const detail: StatusPacketDetail = {
      ...summary,
      activeWarnings,
      ...(latestDispatchRow !== undefined
        ? {
            latestDispatch: {
              receipt_id: latestDispatchRow.id,
              target_tool: latestDispatchRow.target_tool,
              adapter: latestDispatchRow.adapter,
              status: latestDispatchRow.status,
              destination: latestDispatchRow.destination,
              created_at: latestDispatchRow.created_at,
            },
          }
        : {}),
      ...(latestOutcomeRow !== undefined
        ? {
            latestOutcome: {
              outcome_id: latestOutcomeRow.id,
              source_tool: latestOutcomeRow.source_tool,
              classification: latestOutcomeRow.classification,
              created_at: latestOutcomeRow.created_at,
            },
          }
        : {}),
    };

    return { kind: 'packet', packet: detail };
  } finally {
    store.close();
  }
}

function formatHumanList(report: StatusReportList): string {
  if (report.packets.length === 0) {
    return 'no packets in this repo (.baton/packets/ is empty)\n';
  }
  const lines: string[] = [];
  lines.push(`packets (${report.packets.length})`);
  for (const p of report.packets) {
    const blocking = p.blocking_warning_count > 0 ? `(${p.blocking_warning_count} blocking)` : '';
    lines.push(
      `  ${p.id}  status=${p.status}  validation=${p.validation_level}  warnings=${p.warning_count}${blocking}  updated=${p.updated_at}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatHumanPacket(report: StatusReportSingle): string {
  const p = report.packet;
  const lines: string[] = [];
  lines.push(`packet ${p.id}: ${p.title}`);
  lines.push(`  status=${p.status}  validation=${p.validation_level}  task=${p.task_type}`);
  lines.push(`  updated=${p.updated_at}`);
  if (p.latestDispatch !== undefined) {
    const d = p.latestDispatch;
    lines.push(
      `  last dispatch: target=${d.target_tool ?? '?'} adapter=${d.adapter ?? '?'} status=${d.status ?? '?'} at=${d.created_at ?? '?'}`,
    );
  } else {
    lines.push('  last dispatch: (none)');
  }
  if (p.latestOutcome !== undefined) {
    const o = p.latestOutcome;
    lines.push(
      `  last outcome:  source=${o.source_tool ?? '?'} classification=${o.classification ?? '?'} at=${o.created_at ?? '?'}`,
    );
  } else {
    lines.push('  last outcome:  (none)');
  }
  if (p.activeWarnings.length === 0) {
    lines.push('  warnings: (none)');
  } else {
    lines.push(`  warnings (${p.activeWarnings.length}):`);
    for (const w of p.activeWarnings) {
      const tag = w.blocking ? '[BLOCKING] ' : '';
      lines.push(`    ${tag}${w.code} (${w.severity}): ${w.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function runStatus(opts: StatusOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  let report: StatusReport;
  try {
    report = await buildStatusReport(opts);
  } catch (err) {
    process.stderr.write(`status failed: ${(err as Error).message}\n`);
    return 1;
  }
  if (opts.json === true) {
    const { renderJsonResult } = await import('../output/json.js');
    process.stdout.write(renderJsonResult(report));
  } else if (report.kind === 'list') {
    process.stdout.write(formatHumanList(report));
  } else {
    process.stdout.write(formatHumanPacket(report));
  }
  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'status',
      exit_code: 0,
      duration_ms: Date.now() - start,
      ...(opts.packet !== undefined ? { packet_id: opts.packet } : {}),
      meta: {
        kind: report.kind,
        ...(report.kind === 'list' ? { count: report.packets.length } : {}),
      },
    }),
    'command complete',
  );
  return 0;
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show current packet state (single packet with --packet, otherwise list all)')
    .option('--packet <id>', 'packet id (optional; lists all when omitted)')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--json', 'machine-readable output', false)
    .action(async (raw: StatusOptions) => {
      const code = await runStatus(raw);
      process.exitCode = code;
    });
}
