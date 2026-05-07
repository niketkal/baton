import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runRender } from '../../src/commands/render.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('render — missing packet handling', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrText: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-render-missing-'));
    resetLoggerCacheForTests();
    stderrText = '';
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation((s: unknown) => {
      stderrText += typeof s === 'string' ? s : (s as Buffer).toString('utf8');
      return true;
    });
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('exits 1 (user error) with a clean message, not 3 (internal)', async () => {
    const code = await runRender({
      packet: 'does-not-exist',
      target: 'generic',
      repo: dir,
    });
    expect(code).toBe(1);
    expect(stderrText.toLowerCase()).toMatch(/packet|not found|enoent/);
  });
});
