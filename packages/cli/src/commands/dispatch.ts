import type { Command } from 'commander';
import { isOperatorPacketError } from '../output/packet-errors.js';

/**
 * `baton dispatch <packet> --target <tool> --adapter <name>` — render
 * a packet for the chosen target then route the rendered markdown
 * through an adapter:
 *
 *   - `file`      — write to `--out <path>` (or `dispatched-<id>.md` in cwd)
 *   - `stdout`    — print to stdout
 *   - `clipboard` — write to system clipboard
 *   - `shell`     — pipe to `--shell-cmd <cmd>` (deferred-eval; no shell unless asked)
 *
 * `github-comment` is intentionally absent (deferred to v1.5; tech
 * spec §15 / CLAUDE.md).
 *
 * Effects: appends a row to `.baton/events/dispatch.jsonl` with the
 * receipt id, packet id, target, adapter, status. Files are canonical;
 * the events journal is rebuildable from the rendered artifact dir.
 */

export type DispatchTarget = 'generic' | 'claude-code' | 'codex' | 'cursor';
export type DispatchAdapter = 'file' | 'stdout' | 'clipboard' | 'shell';

const ADAPTERS: readonly DispatchAdapter[] = ['file', 'stdout', 'clipboard', 'shell'];
const TARGETS: readonly DispatchTarget[] = ['generic', 'claude-code', 'codex', 'cursor'];

export interface DispatchOptions {
  packet: string;
  target?: DispatchTarget;
  adapter?: DispatchAdapter;
  out?: string;
  shellCmd?: string;
  repo?: string;
  json?: boolean;
}

export interface DispatchResult {
  receiptId: string;
  packetId: string;
  target: DispatchTarget;
  adapter: DispatchAdapter;
  status: 'ok' | 'error';
  destination?: string;
  bytes: number;
  /**
   * Rendered markdown body. Only populated for `--adapter stdout --json`
   * where stdout is reserved for the JSON receipt — the rendered packet
   * has nowhere else to go. Other adapters know where the markdown
   * landed (file path, clipboard, etc.) so this stays undefined.
   */
  markdown?: string;
}

async function runAdapter(
  adapter: DispatchAdapter,
  markdown: string,
  opts: DispatchOptions,
  repoRoot: string,
): Promise<{ destination: string }> {
  if (adapter === 'stdout') {
    // In --json mode the stdout slot is reserved for the JSON receipt
    // (the CLI's machine-readable contract). Don't write markdown to
    // stdout here; runDispatch() embeds it in the receipt instead.
    if (opts.json !== true) {
      process.stdout.write(markdown);
      if (!markdown.endsWith('\n')) process.stdout.write('\n');
    }
    return { destination: 'stdout' };
  }
  if (adapter === 'clipboard') {
    const { default: clipboardy } = await import('clipboardy');
    await clipboardy.write(markdown);
    return { destination: 'clipboard' };
  }
  if (adapter === 'file') {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { dirname, isAbsolute, join, resolve } = await import('node:path');
    const out = opts.out ?? join(repoRoot, '.baton', 'dispatched', `${opts.packet}.md`);
    const outPath = isAbsolute(out) ? out : resolve(repoRoot, out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, markdown, 'utf8');
    return { destination: outPath };
  }
  if (adapter === 'shell') {
    if (!opts.shellCmd || opts.shellCmd.length === 0) {
      throw new Error('--shell-cmd is required when --adapter shell is selected');
    }
    const { spawn } = await import('node:child_process');
    await new Promise<void>((resolveP, rejectP) => {
      // shell:true intentional — adapter contract is "pipe to a user-given
      // shell command". The command came from the CLI flag, not the
      // packet content, so it's already in the user's trust boundary.
      const proc = spawn(opts.shellCmd as string, {
        shell: true,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      proc.on('error', rejectP);
      proc.on('exit', (code) => {
        if (code === 0) resolveP();
        else rejectP(new Error(`shell adapter exited with code ${code ?? 'null'}`));
      });
      proc.stdin.write(markdown);
      proc.stdin.end();
    });
    return { destination: `shell:${opts.shellCmd}` };
  }
  throw new Error(`unknown adapter: ${adapter}`);
}

export async function runDispatch(opts: DispatchOptions): Promise<number> {
  const { mkdirSync, appendFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { randomUUID } = await import('node:crypto');
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const target = opts.target ?? 'generic';
  const adapter = opts.adapter ?? 'file';

  if (!TARGETS.includes(target)) {
    process.stderr.write(`unknown target: ${target}. Supported: ${TARGETS.join(', ')}\n`);
    return 1;
  }
  if (!ADAPTERS.includes(adapter)) {
    process.stderr.write(`unknown adapter: ${adapter}. Supported: ${ADAPTERS.join(', ')}\n`);
    return 1;
  }

  // Lazy: PacketStore drags better-sqlite3 (native binding); render
  // pulls @batonai/render. Keep them off the cold-start path.
  const { render } = await import('@batonai/render');
  const { PacketStore } = await import('@batonai/store');
  const store = PacketStore.open(repoRoot);
  let markdown: string;
  try {
    let packet: ReturnType<typeof store.read>;
    try {
      packet = store.read(opts.packet);
    } catch (err) {
      // Surface only operator-error shapes (missing packet / invalid
      // id) as exit-1. Schema-assert failures and malformed JSON are
      // canonical-state corruption — let them escape to main.ts so
      // the user gets exit-3 (internal failure) rather than thinking
      // they typed the id wrong.
      if (isOperatorPacketError(err)) {
        process.stderr.write(`baton: ${(err as Error).message}\n`);
        return 1;
      }
      throw err;
    }
    const r = render(packet, target);
    markdown = r.markdown;
  } finally {
    store.close();
  }

  const receiptId = randomUUID();
  let status: DispatchResult['status'] = 'ok';
  let destination = '';
  try {
    const out = await runAdapter(adapter, markdown, opts, repoRoot);
    destination = out.destination;
  } catch (err) {
    status = 'error';
    process.stderr.write(`dispatch failed: ${(err as Error).message}\n`);
  }

  // Append to the dispatch-events journal regardless of success: we
  // want an audit row even for failed attempts.
  const eventsDir = join(repoRoot, '.baton', 'events');
  mkdirSync(eventsDir, { recursive: true });
  const event = {
    id: receiptId,
    packet_id: opts.packet,
    target_tool: target,
    adapter,
    status,
    destination,
    receipt_json: JSON.stringify({ bytes: Buffer.byteLength(markdown, 'utf8') }),
    created_at: new Date().toISOString(),
  };
  appendFileSync(join(eventsDir, 'dispatch.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');

  const result: DispatchResult = {
    receiptId,
    packetId: opts.packet,
    target,
    adapter,
    status,
    bytes: Buffer.byteLength(markdown, 'utf8'),
    ...(destination !== '' ? { destination } : {}),
    // For --adapter stdout --json the runAdapter step suppressed the
    // markdown print so stdout is free for the JSON receipt. Embed the
    // rendered markdown in the receipt so callers can still recover it
    // from a single stdout payload.
    ...(adapter === 'stdout' && opts.json === true && status === 'ok' ? { markdown } : {}),
  };

  if (status === 'ok') {
    if (opts.json === true) {
      // JSON-mode contract: structured receipt always lands on stdout,
      // regardless of adapter. For the stdout adapter the receipt
      // contains the markdown body too (see DispatchResult.markdown).
      const { renderJsonResult } = await import('../output/json.js');
      process.stdout.write(renderJsonResult(result));
    } else if (adapter !== 'stdout') {
      // Human-mode summary; the stdout adapter already wrote markdown
      // to stdout in runAdapter, no extra summary line.
      const { renderHumanResult } = await import('../output/human.js');
      process.stdout.write(
        renderHumanResult({
          ok: true,
          title: `dispatched ${opts.packet}`,
          summary: `target=${target} adapter=${adapter}`,
          details: destination !== '' ? [`destination: ${destination}`] : [],
        }),
      );
    }
  }

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'dispatch',
      exit_code: status === 'ok' ? 0 : 1,
      duration_ms: Date.now() - start,
      packet_id: opts.packet,
      target,
      meta: { adapter, receipt_id: receiptId, status },
    }),
    'command complete',
  );
  return status === 'ok' ? 0 : 1;
}

export function registerDispatch(program: Command): void {
  program
    .command('dispatch <packet>')
    .description('Render a packet and route it through an adapter')
    .option('--target <name>', `render target (${TARGETS.join('|')})`, 'generic')
    .option('--adapter <name>', `dispatch adapter (${ADAPTERS.join('|')})`, 'file')
    .option('--out <path>', 'destination path (file adapter only)')
    .option('--shell-cmd <cmd>', 'shell command to pipe markdown into (shell adapter only)')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--json', 'machine-readable output', false)
    .action(async (packet: string, raw: Omit<DispatchOptions, 'packet'>) => {
      const code = await runDispatch({ ...raw, packet });
      process.exitCode = code;
    });
}
