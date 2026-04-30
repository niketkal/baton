import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Command } from 'commander';

export interface InitOptions {
  repo?: string;
  dryRun?: boolean;
  yes?: boolean;
  integration?: string;
}

const DEFAULT_CONFIG_TOML = `# Baton local configuration
# See: docs/spec/cli-contract.md

[llm]
# provider = "anthropic"   # uncomment + set to enable LLM-driven compile --full
# model    = "claude-3-5-sonnet-latest"
`;

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

export async function runInit(opts: InitOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const batonDir = join(repoRoot, '.baton');
  const configPath = join(batonDir, 'config.toml');
  const subdirs = ['packets', 'artifacts', 'history', 'logs', 'integrations'];

  // Lazy-load: keep cold start cheap.
  const { listIntegrations, getIntegration } = await import('@batonai/integrations');

  if (opts.dryRun !== true) {
    mkdirSync(batonDir, { recursive: true });
    for (const d of subdirs) mkdirSync(join(batonDir, d), { recursive: true });
    if (!existsSync(configPath)) {
      writeFileSync(configPath, DEFAULT_CONFIG_TOML, 'utf8');
    }
    process.stdout.write(`Initialized Baton in ${batonDir}\n`);
  } else {
    process.stdout.write(`Would create: ${batonDir}\n`);
    process.stdout.write(`Would create: ${configPath}\n`);
    for (const d of subdirs) process.stdout.write(`Would create: ${join(batonDir, d)}\n`);
  }

  const targets = opts.integration
    ? [getIntegration(opts.integration)].filter((x): x is NonNullable<typeof x> => x !== undefined)
    : listIntegrations();

  if (opts.integration && targets.length === 0) {
    process.stderr.write(`baton: unknown integration "${opts.integration}"\n`);
    return 1;
  }

  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (const integration of targets) {
    const det = await integration.detect();
    if (!det.installed) {
      process.stderr.write(`- ${integration.id}: ${det.reason ?? 'not detected'} (skipped)\n`);
      skipped++;
      continue;
    }
    let plan: Awaited<ReturnType<typeof integration.dryRun>>;
    try {
      plan = await integration.dryRun({ repoRoot });
    } catch (err) {
      process.stderr.write(`- ${integration.id}: dry-run failed: ${(err as Error).message}\n`);
      failed++;
      continue;
    }

    process.stdout.write(`\n${integration.id} (${plan.mode}):\n`);
    process.stdout.write(`  hooks: ${plan.hookEvents.join(', ')}\n`);
    process.stdout.write('  files to create:\n');
    for (const f of plan.filesCreated) process.stdout.write(`    + ${f}\n`);
    if (plan.warnings.length > 0) {
      for (const w of plan.warnings) process.stdout.write(`  warning: ${w}\n`);
    }

    if (opts.dryRun === true) {
      skipped++;
      continue;
    }

    let confirmed = opts.yes === true;
    if (!confirmed) {
      const answer = await prompt('Install this integration? [y/N] ');
      confirmed = isYes(answer);
    }
    if (!confirmed) {
      process.stderr.write(`- ${integration.id}: skipped by user\n`);
      skipped++;
      continue;
    }

    try {
      await integration.install({ repoRoot });
      process.stdout.write('  installed.\n');
      installed++;
    } catch (err) {
      process.stderr.write(`- ${integration.id}: install failed: ${(err as Error).message}\n`);
      failed++;
    }
  }

  process.stdout.write(`\nSummary: ${installed} installed, ${skipped} skipped, ${failed} failed\n`);

  const exitCode = failed > 0 ? 3 : 0;

  // In dry-run we deliberately skip the logger so we don't create
  // `.baton/logs/` on disk while the user is just previewing.
  if (opts.dryRun === true) return exitCode;

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'init',
      exit_code: exitCode,
      duration_ms: Date.now() - start,
      path: batonDir,
      shape: { installed, skipped, failed },
    }),
    'command complete',
  );
  return exitCode;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create repo-local Baton state under .baton/ and install integrations')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--dry-run', 'preview without writing', false)
    .option('--yes', 'skip interactive prompts', false)
    .option('--integration <id>', 'install only the named integration')
    .action(async (raw: InitOptions) => {
      const code = await runInit(raw);
      process.exitCode = code;
    });
}
