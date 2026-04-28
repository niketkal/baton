import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

export interface InitOptions {
  repo?: string;
  dryRun?: boolean;
}

const DEFAULT_CONFIG_TOML = `# Baton local configuration
# See: docs/spec/cli-contract.md

[llm]
# provider = "anthropic"   # uncomment + set to enable LLM-driven compile --full
# model    = "claude-3-5-sonnet-latest"
`;

export async function runInit(opts: InitOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const batonDir = join(repoRoot, '.baton');
  const configPath = join(batonDir, 'config.toml');
  const subdirs = ['packets', 'artifacts', 'history', 'logs'];

  if (opts.dryRun === true) {
    process.stdout.write(`Would create: ${batonDir}\n`);
    process.stdout.write(`Would create: ${configPath}\n`);
    for (const d of subdirs) process.stdout.write(`Would create: ${join(batonDir, d)}\n`);
    process.stderr.write('no integrations to install yet — see Session 14 for hook installation\n');
    return 0;
  }

  mkdirSync(batonDir, { recursive: true });
  for (const d of subdirs) mkdirSync(join(batonDir, d), { recursive: true });
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG_TOML, 'utf8');
  }

  process.stdout.write(`Initialized Baton in ${batonDir}\n`);
  process.stderr.write('no integrations to install yet — see Session 14 for hook installation\n');

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'init',
      exit_code: 0,
      duration_ms: Date.now() - start,
      path: batonDir,
    }),
    'command complete',
  );
  return 0;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create repo-local Baton state under .baton/')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--dry-run', 'preview without writing', false)
    .action(async (raw: { repo?: string; dryRun?: boolean }) => {
      const code = await runInit(raw);
      process.exitCode = code;
    });
}
