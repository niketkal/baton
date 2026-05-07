import type { Command } from 'commander';

/**
 * `baton outcome ingest <packet> --source <tool> <path>` — record the
 * result of a dispatched packet. Outcomes land at:
 *
 *   .baton/packets/<packet-id>/outcomes/<timestamp>-<source>.json
 *
 * Per tech spec §6.2. We also append a row to the `outcome_events`
 * journal at `.baton/events/outcomes.jsonl` so `baton history` and
 * `baton status` can read it without re-walking the file tree. The
 * journal is rebuildable from the per-packet JSON files.
 *
 * Classification: heuristic only. We look at the raw text for hints
 * like "tests pass", "merged", "error", "failed", "TODO", "blocked"
 * and bucket into one of:
 *   - `success`
 *   - `failure`
 *   - `incomplete`
 *   - `unknown`
 *
 * The CLI surfaces the bucket but always writes the original payload
 * to disk so a more sophisticated classifier can run later.
 */

export type OutcomeClass = 'success' | 'failure' | 'incomplete' | 'unknown';

export interface OutcomeIngestOptions {
  packet: string;
  source?: string;
  repo?: string;
  json?: boolean;
}

export interface OutcomeIngestResult {
  outcomeId: string;
  packetId: string;
  source: string;
  classification: OutcomeClass;
  outcomePath: string;
}

const SUCCESS_HINTS = [
  /\bpasses?\b/i,
  /\bpassed\b/i,
  /\btests? pass(?:ing|ed)?\b/i,
  /\bmerged\b/i,
  /\bsucceeded\b/i,
  /\bsuccess\b/i,
  /\bgreen\b/i,
  /\ball checks pass/i,
];
const FAILURE_HINTS = [
  /\bfail(?:ed|ing|ure)\b/i,
  /\berror\b/i,
  /\bexception\b/i,
  /\bcrash(?:ed)?\b/i,
  /\bred\b/i,
  /\baborted\b/i,
];
const INCOMPLETE_HINTS = [
  /\bin progress\b/i,
  /\btodo\b/i,
  /\bblocked\b/i,
  /\bpartial\b/i,
  /\bskipped\b/i,
  /\bpending\b/i,
];

export function classifyOutcome(text: string): OutcomeClass {
  // Order matters: failure > incomplete > success. A note that says
  // "tests pass but build failed" should bucket as failure.
  if (FAILURE_HINTS.some((re) => re.test(text))) return 'failure';
  if (INCOMPLETE_HINTS.some((re) => re.test(text))) return 'incomplete';
  if (SUCCESS_HINTS.some((re) => re.test(text))) return 'success';
  return 'unknown';
}

async function readPathOrStdin(source: string, repoRoot: string): Promise<string> {
  const { readFileSync } = await import('node:fs');
  const { isAbsolute, resolve } = await import('node:path');
  if (source === '-') {
    return new Promise<string>((resolveP, rejectP) => {
      const chunks: Buffer[] = [];
      process.stdin.on('data', (c: Buffer) => chunks.push(c));
      process.stdin.on('end', () => resolveP(Buffer.concat(chunks).toString('utf8')));
      process.stdin.on('error', (e) => rejectP(e));
    });
  }
  // Resolve relative paths against `--repo` (the repoRoot the user
  // explicitly targeted) rather than process.cwd(). In multi-repo
  // automation those can disagree, and silently ingesting from the
  // wrong directory attaches the wrong artifact to the packet.
  const p = isAbsolute(source) ? source : resolve(repoRoot, source);
  return readFileSync(p, 'utf8');
}

function timestampSlug(d = new Date()): string {
  // 2026-04-26T15-42-09-123Z, filesystem-friendly.
  return d.toISOString().replace(/[:.]/g, '-');
}

function sanitizeSource(s: string): string {
  // Replace anything not [a-z0-9_-] (note: NO dots — `..` would be a
  // path-traversal foothold inside the timestamped filename) with `_`.
  const cleaned = s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned.length > 0 ? cleaned : 'unknown';
}

export async function runOutcomeIngest(
  source: string,
  opts: OutcomeIngestOptions,
): Promise<number> {
  const { existsSync, mkdirSync, writeFileSync, appendFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { randomUUID } = await import('node:crypto');
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  // Validate packet id BEFORE joining into a filesystem path. The flag value
  // is untrusted; without this check, `--packet ../../foo` would write outcome
  // JSON outside .baton/packets/. See @batonai/store validatePacketId().
  const validatePacketId: (id: unknown) => asserts id is string = (await import('@batonai/store'))
    .validatePacketId;
  try {
    validatePacketId(opts.packet);
  } catch (err) {
    process.stderr.write(`baton: ${(err as Error).message}\n`);
    return 1;
  }
  const sourceTool = sanitizeSource(opts.source ?? 'unknown');

  let raw: string;
  try {
    raw = await readPathOrStdin(source, repoRoot);
  } catch (err) {
    process.stderr.write(`failed to read outcome source: ${(err as Error).message}\n`);
    return 1;
  }

  const classification = classifyOutcome(raw);

  // If the input looks like JSON, preserve as-is; otherwise wrap as
  // a markdown payload field so the on-disk file is always JSON.
  let payload: Record<string, unknown>;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      payload = { format: 'json', body: JSON.parse(trimmed) as unknown };
    } catch {
      payload = { format: 'text', body: raw };
    }
  } else {
    payload = { format: 'markdown', body: raw };
  }

  // Reject ingest against a packet that doesn't exist on disk. Without
  // this guard, mkdirSync below silently materializes an orphan
  // `.baton/packets/<id>/outcomes/` skeleton with no packet.json,
  // breaking the "files canonical" invariant (see issue #31).
  const packetJson = join(repoRoot, '.baton', 'packets', opts.packet, 'packet.json');
  if (!existsSync(packetJson)) {
    process.stderr.write(`baton: no such packet: ${opts.packet}\n`);
    return 1;
  }

  const outcomeId = randomUUID();
  const ts = timestampSlug();
  const outcomesDir = join(repoRoot, '.baton', 'packets', opts.packet, 'outcomes');
  mkdirSync(outcomesDir, { recursive: true });
  const outcomePath = join(outcomesDir, `${ts}-${sourceTool}.json`);

  const record = {
    id: outcomeId,
    packet_id: opts.packet,
    source_tool: sourceTool,
    classification,
    created_at: new Date().toISOString(),
    ...payload,
  };
  writeFileSync(outcomePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  // Append to the outcome-events journal. JSONL keeps this safe to
  // append-only without locking; readers filter on packet_id.
  const eventsPath = join(repoRoot, '.baton', 'events', 'outcomes.jsonl');
  mkdirSync(join(repoRoot, '.baton', 'events'), { recursive: true });
  appendFileSync(
    eventsPath,
    `${JSON.stringify({
      id: outcomeId,
      packet_id: opts.packet,
      source_tool: sourceTool,
      classification,
      outcome_path: outcomePath,
      created_at: record.created_at,
    })}\n`,
    'utf8',
  );

  const result: OutcomeIngestResult = {
    outcomeId,
    packetId: opts.packet,
    source: sourceTool,
    classification,
    outcomePath,
  };

  const { renderHumanResult } = await import('../output/human.js');
  const { renderJsonResult } = await import('../output/json.js');
  if (opts.json === true) {
    process.stdout.write(renderJsonResult(result));
  } else {
    process.stdout.write(
      renderHumanResult({
        ok: classification !== 'failure',
        title: `outcome ingested (${classification})`,
        summary: `packet=${opts.packet} source=${sourceTool}`,
        details: [`stored at ${outcomePath}`],
      }),
    );
  }

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'outcome',
      subcommand: 'ingest',
      exit_code: 0,
      duration_ms: Date.now() - start,
      packet_id: opts.packet,
      meta: { source_tool: sourceTool, classification },
    }),
    'command complete',
  );
  return 0;
}

export function registerOutcome(program: Command): void {
  const outcome = program
    .command('outcome')
    .description('Record dispatched-packet outcomes (success | failure | incomplete | unknown)');
  outcome
    .command('ingest <packet> <path>')
    .description('Ingest an outcome JSON or markdown file (use - for stdin)')
    .option('--source <tool>', 'reporting tool name (codex | claude-code | ci | ...)')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--json', 'machine-readable output', false)
    .action(async (packet: string, path: string, raw: Omit<OutcomeIngestOptions, 'packet'>) => {
      const code = await runOutcomeIngest(path, { ...raw, packet });
      process.exitCode = code;
    });
}
