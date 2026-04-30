import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runUninstall } from '../../src/commands/uninstall.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('cli uninstall', () => {
  let pluginDir: string;
  let repoRoot: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'baton-cli-pluginDir-'));
    repoRoot = mkdtempSync(join(tmpdir(), 'baton-cli-repo-'));
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(pluginDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    rmSync(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('removes a previously-installed claude-code integration', async () => {
    const integrations = await import('@batonai/integrations');
    const { __setSpawnForTests } = await import('../../../integrations/src/claude-code/detect.js');
    __setSpawnForTests((() => ({
      pid: 0,
      output: [],
      stdout: 'claude 2.4.1\n',
      stderr: '',
      status: 0,
      signal: null,
    })) as unknown as typeof import('node:child_process').spawnSync);

    const cc = integrations.getIntegration('claude-code');
    if (!cc) throw new Error('claude-code integration missing from registry');
    await cc.install({ pluginDir, repoRoot });

    expect(existsSync(join(pluginDir, 'baton', 'plugin.json'))).toBe(true);

    const code = await runUninstall('claude-code', { repo: repoRoot, yes: true });
    expect(code).toBe(0);
    expect(existsSync(join(pluginDir, 'baton'))).toBe(false);

    // installed.json should no longer mention claude-code
    const status = await cc.status({ repoRoot });
    expect(status).toBeNull();

    __setSpawnForTests(null);
  });

  it('errors when neither integration nor --all is passed', async () => {
    const code = await runUninstall(undefined, { repo: repoRoot });
    expect(code).toBe(1);
  });
});
