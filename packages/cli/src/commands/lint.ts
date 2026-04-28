import { join } from 'node:path';
import { lint } from '@baton/lint';
import { PacketStore } from '@baton/store';
import type { Command } from 'commander';
import { renderHumanResult } from '../output/human.js';
import { renderJsonResult } from '../output/json.js';
import { getLogger } from '../output/logger.js';
import { redactForLog } from '../output/redact.js';

export interface LintCommandOptions {
  packet: string;
  strict?: boolean;
  json?: boolean;
  repo?: string;
}

export async function runLint(opts: LintCommandOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const store = PacketStore.open(join(repoRoot, '.baton'));
  let report: ReturnType<typeof lint>;
  try {
    const packet = store.read(opts.packet);
    report = lint(packet, { repoRoot }, { strict: opts.strict === true });
  } finally {
    store.close();
  }

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
