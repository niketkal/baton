import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/commands/init.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('cli init', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-init-'));
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('--dry-run prints a plan and does not create .baton', async () => {
    const code = await runInit({ repo: dir, dryRun: true });
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.baton'))).toBe(false);
    expect(stdout).toHaveBeenCalled();
  });

  it('without --dry-run creates .baton scaffolding', async () => {
    // claude-code likely not installed in CI — that's fine, init still
    // creates the local scaffold and reports the integration as skipped.
    const code = await runInit({ repo: dir, yes: true });
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.baton'))).toBe(true);
    expect(existsSync(join(dir, '.baton', 'config.toml'))).toBe(true);
    expect(existsSync(join(dir, '.baton', 'integrations'))).toBe(true);
  });
});
