import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';

export interface ConformanceCommandOptions {
  against?: string;
  casesDir?: string;
  json?: boolean;
}

/**
 * Default `--against` resolution: when the user doesn't pass one,
 * we use the directory of the currently-running `baton` bin and
 * point at `bin.js` next to it. This matches the contributor flow
 * "build, then run conformance against your local checkout."
 *
 * Returns `undefined` if the local bin can't be located, so we can
 * surface a clear error rather than silently passing a bad path
 * down to the runner.
 */
function defaultLocalBin(): string | undefined {
  // Walk up from the compiled location of THIS module
  // (`<pkg>/dist/commands/conformance.js`) to find the sibling
  // `bin.js`. Source path
  // (`<pkg>/src/commands/conformance.ts`) is also handled.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '..', 'bin.js'), resolve(here, '..', '..', 'dist', 'bin.js')];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

export async function runConformanceCommand(opts: ConformanceCommandOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = process.cwd();
  const binPath = opts.against ?? defaultLocalBin();
  if (binPath === undefined) {
    process.stderr.write(
      'baton conformance: could not locate the local baton bin. Pass --against <path>.\n',
    );
    return 1;
  }
  if (!existsSync(binPath)) {
    process.stderr.write(`baton conformance: bin not found: ${binPath}\n`);
    return 1;
  }

  // Lazy-load the conformance package — it's heavy because it
  // spawns child processes. Top-level import would tax cold start.
  const { loadCases, runConformance, formatReport } = await import('@batonai/conformance');
  const cases = loadCases(opts.casesDir !== undefined ? { casesDir: opts.casesDir } : {});
  const report = await runConformance({ cases, binPath });
  const output = formatReport(report, opts.json === true ? 'json' : 'human');
  process.stdout.write(output);

  const exitCode = report.failed === 0 ? 0 : 2;
  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'conformance',
      exit_code: exitCode,
      duration_ms: Date.now() - start,
      shape: { passed: report.passed, failed: report.failed, total: report.total },
    }),
    'command complete',
  );
  return exitCode;
}

export function registerConformance(program: Command): void {
  program
    .command('conformance')
    .description('Run the Baton conformance suite against a CLI binary')
    .option('--against <binPath>', 'path to the baton CLI bin (defaults to the local checkout)')
    .option('--cases-dir <dir>', 'override the cases root directory')
    .option('--json', 'machine-readable output', false)
    .action(async (raw: ConformanceCommandOptions) => {
      const code = await runConformanceCommand(raw);
      process.exitCode = code;
    });
}
