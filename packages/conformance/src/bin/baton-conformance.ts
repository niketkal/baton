#!/usr/bin/env node
/**
 * `npx @baton/conformance --against <bin>` entrypoint.
 *
 * Lazy-loads heavy modules (commander, the runner) inside `main`
 * so that `--help` / `--version` returns quickly even when the
 * runner has a fat dep graph. Mirrors the cold-start discipline
 * used by `@baton/cli`.
 */
async function main(argv: string[]): Promise<number> {
  const { Command } = await import('commander');
  const program = new Command();
  program
    .name('baton-conformance')
    .description('Run the Baton conformance suite against a CLI binary')
    .option('--against <binPath>', 'path to the baton CLI bin (a .js entrypoint)')
    .option('--cases-dir <dir>', 'override the cases root directory')
    .option('--json', 'emit a machine-readable JSON report', false)
    .allowExcessArguments(false);

  program.parse(argv);
  const opts = program.opts<{ against?: string; casesDir?: string; json?: boolean }>();

  if (opts.against === undefined || opts.against === '') {
    process.stderr.write('baton-conformance: --against <binPath> is required\n');
    return 1;
  }

  const { runConformance } = await import('../runner.js');
  const { formatReport } = await import('../report.js');
  const { loadCases } = await import('../cases/index.js');

  const cases = loadCases(opts.casesDir !== undefined ? { casesDir: opts.casesDir } : {});
  const report = await runConformance({ cases, binPath: opts.against });
  const output = formatReport(report, opts.json === true ? 'json' : 'human');
  process.stdout.write(output);
  return report.failed === 0 ? 0 : 2;
}

main(process.argv).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(
      `baton-conformance: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(3);
  },
);
