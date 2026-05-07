import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { RenderTarget } from '@batonai/render';
import type { Command } from 'commander';

const SUPPORTED_TARGETS: RenderTarget[] = ['generic', 'claude-code', 'codex', 'cursor'];

export interface RenderCommandOptions {
  packet: string;
  target?: RenderTarget;
  out?: string;
  copy?: boolean;
  stdout?: boolean;
  repo?: string;
  json?: boolean;
}

export async function runRender(opts: RenderCommandOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const target: RenderTarget = opts.target ?? 'generic';
  if (!SUPPORTED_TARGETS.includes(target)) {
    process.stderr.write(
      `unknown render target: ${target}. Supported: ${SUPPORTED_TARGETS.join(', ')}\n`,
    );
    return 1;
  }

  // Lazy: PacketStore drags better-sqlite3 (native binding); render
  // pulls @batonai/render. Keep them off the cold-start path.
  const { render } = await import('@batonai/render');
  const { PacketStore } = await import('@batonai/store');
  const store = PacketStore.open(repoRoot);
  let result: ReturnType<typeof render>;
  try {
    let packet: ReturnType<typeof store.read>;
    try {
      packet = store.read(opts.packet);
    } catch (err) {
      // Missing/invalid packet is operator error, not an internal
      // failure. Surface a clean exit-1 message rather than letting
      // the throw bubble up to main.ts which maps it to exit-3.
      process.stderr.write(`baton: ${(err as Error).message}\n`);
      return 1;
    }
    result = render(packet, target);
  } finally {
    store.close();
  }

  if (opts.out !== undefined) {
    const outPath = isAbsolute(opts.out) ? opts.out : resolve(repoRoot, opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, result.markdown, 'utf8');
    process.stdout.write(`wrote ${outPath}\n`);
  } else if (opts.copy === true) {
    const { default: clipboardy } = await import('clipboardy');
    await clipboardy.write(result.markdown);
    process.stdout.write('copied to clipboard\n');
  } else if (opts.json === true) {
    const { renderJsonResult } = await import('../output/json.js');
    process.stdout.write(
      renderJsonResult({
        target: result.target,
        markdown: result.markdown,
        tokenEstimate: result.tokenEstimate,
        truncated: result.truncated,
      }),
    );
  } else {
    process.stdout.write(result.markdown);
    if (!result.markdown.endsWith('\n')) process.stdout.write('\n');
  }

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'render',
      exit_code: 0,
      duration_ms: Date.now() - start,
      packet_id: opts.packet,
      target,
      ...(opts.out !== undefined ? { path: opts.out } : {}),
    }),
    'command complete',
  );
  return 0;
}

export function registerRender(program: Command): void {
  program
    .command('render')
    .description('Render a packet for a target tool')
    .requiredOption('--packet <id>', 'packet id')
    .option('--target <name>', 'render target (generic|claude-code|codex|cursor)', 'generic')
    .option('--out <path>', 'write to file')
    .option('--copy', 'copy to system clipboard', false)
    .option('--stdout', 'force stdout output', false)
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--json', 'machine-readable output', false)
    .action(async (raw: RenderCommandOptions) => {
      const code = await runRender(raw);
      process.exitCode = code;
    });
}
