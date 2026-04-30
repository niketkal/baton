import type { Command } from 'commander';

export interface LintCommandOptions {
  packet: string;
  strict?: boolean;
  json?: boolean;
  repo?: string;
}

export async function runLint(opts: LintCommandOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  // Lazy-load: PacketStore drags better-sqlite3, lint is its own
  // chunk, and `@batonai/compiler` pulls simple-git for repo attach.
  // All off the cold-start path.
  const { lint } = await import('@batonai/lint');
  const { PacketStore } = await import('@batonai/store');
  const { attachRepo, assessFreshness } = await import('@batonai/compiler');
  const store = PacketStore.open(repoRoot);
  let report: ReturnType<typeof lint>;
  try {
    const packet = store.read(opts.packet);
    // Construct the real LintContext: BTN012/013/014 only fire when
    // the compiler-side accessors and freshness signal are injected.
    const repo = await attachRepo({ root: repoRoot });
    const freshness = await assessFreshness(packet, repo);
    const lintCtx: Parameters<typeof lint>[1] = {
      repoRoot,
      ...(repo.fs !== undefined ? { fs: repo.fs } : {}),
      ...(repo.gitRefs !== undefined ? { gitRefs: repo.gitRefs } : {}),
      freshness: {
        stale: freshness.stale,
        ...(freshness.reason !== undefined ? { reason: freshness.reason } : {}),
      },
    };
    report = lint(packet, lintCtx, { strict: opts.strict === true });
  } finally {
    store.close();
  }

  const { renderHumanResult } = await import('../output/human.js');
  const { renderJsonResult } = await import('../output/json.js');
  if (opts.json === true) {
    process.stdout.write(renderJsonResult(report));
  } else {
    process.stdout.write(
      renderHumanResult({
        ok: report.status === 'passed',
        title: `lint ${report.packetId}: ${report.status}`,
        summary: `${report.summary.blockingCount} blocking · ${report.summary.warningCount} warnings`,
      }),
    );
  }

  const exitCode = report.status === 'passed' ? 0 : 2;
  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'lint',
      exit_code: exitCode,
      duration_ms: Date.now() - start,
      packet_id: opts.packet,
      shape: {
        blocking: report.summary.blockingCount,
        warnings: report.summary.warningCount,
      },
    }),
    'command complete',
  );
  return exitCode;
}

export function registerLint(program: Command): void {
  program
    .command('lint')
    .description('Check whether a packet is safe and complete enough to dispatch')
    .requiredOption('--packet <id>', 'packet id')
    .option('--strict', 'promote failInStrict findings to errors', false)
    .option('--json', 'machine-readable output', false)
    .option('--repo <path>', 'repo root', process.cwd())
    .action(async (raw: LintCommandOptions) => {
      const code = await runLint(raw);
      process.exitCode = code;
    });
}
