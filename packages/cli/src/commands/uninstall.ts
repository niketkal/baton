import { createInterface } from 'node:readline';
import type { Command } from 'commander';

export interface UninstallOptions {
  repo?: string;
  dryRun?: boolean;
  yes?: boolean;
  all?: boolean;
}

async function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function isYes(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === 'y' || t === 'yes';
}

export async function runUninstall(
  integrationArg: string | undefined,
  opts: UninstallOptions,
): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();

  const integrations = await import('@batonai/integrations');
  const { getIntegration } = integrations;

  const ids: string[] = [];
  if (opts.all === true) {
    // We need the list of installed ids. The cleanest source is the
    // manifest file. Read it through @batonai/integrations' status()
    // probes by enumerating registered integrations.
    for (const i of integrations.listIntegrations()) {
      const s = await i.status({ repoRoot });
      if (s) ids.push(i.id);
    }
  } else if (integrationArg) {
    ids.push(integrationArg);
  } else {
    process.stderr.write('baton: uninstall requires <integration> or --all\n');
    return 1;
  }

  let removed = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of ids) {
    const integration = getIntegration(id);
    if (!integration) {
      process.stderr.write(`- ${id}: unknown integration\n`);
      failed++;
      continue;
    }
    const status = await integration.status({ repoRoot });
    if (!status) {
      process.stderr.write(`- ${id}: not installed\n`);
      skipped++;
      continue;
    }

    process.stdout.write(`\n${id} (${status.mode}):\n`);
    process.stdout.write(`  pluginDir: ${status.pluginDir}\n`);
    process.stdout.write(`  installedAt: ${status.installedAt}\n`);
    process.stdout.write('  will remove Baton-installed files (sha256-checked)\n');

    if (opts.dryRun === true) {
      skipped++;
      continue;
    }

    let confirmed = opts.yes === true;
    if (!confirmed) {
      const answer = await prompt('Uninstall this integration? [y/N] ');
      confirmed = isYes(answer);
    }
    if (!confirmed) {
      process.stderr.write(`- ${id}: skipped by user\n`);
      skipped++;
      continue;
    }

    try {
      await integration.uninstall({ repoRoot });
      process.stdout.write('  removed.\n');
      removed++;
    } catch (err) {
      process.stderr.write(`- ${id}: uninstall failed: ${(err as Error).message}\n`);
      failed++;
    }
  }

  process.stdout.write(`\nSummary: ${removed} removed, ${skipped} skipped, ${failed} failed\n`);

  const exitCode = failed > 0 ? 3 : 0;

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'uninstall',
      exit_code: exitCode,
      duration_ms: Date.now() - start,
      shape: { removed, skipped, failed },
    }),
    'command complete',
  );
  return exitCode;
}

export function registerUninstall(program: Command): void {
  program
    .command('uninstall [integration]')
    .description('Remove a Baton integration (e.g. claude-code) or --all')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--dry-run', 'preview without writing', false)
    .option('--yes', 'skip interactive prompts', false)
    .option('--all', 'uninstall every registered integration', false)
    .action(async (integration: string | undefined, raw: UninstallOptions) => {
      const code = await runUninstall(integration, raw);
      process.exitCode = code;
    });
}
