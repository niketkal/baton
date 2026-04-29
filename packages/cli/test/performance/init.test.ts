import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BIN, BUDGETS, ensureBuilt } from './_helpers.js';

describe('performance: baton init', () => {
  let dir: string;

  beforeAll(() => {
    ensureBuilt();
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-perf-init-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it.skipIf(process.env.CI === 'true' && process.platform === 'win32')(
    '`init --dry-run` completes under the dry-run budget (500ms target)',
    () => {
      const start = Date.now();
      const r = spawnSync(
        process.execPath,
        [BIN, 'init', '--dry-run', '--repo', dir, '--yes', '--integration', 'claude-code'],
        { encoding: 'utf8' },
      );
      const elapsed = Date.now() - start;
      expect(r.status).toBe(0);
      expect(elapsed).toBeLessThan(BUDGETS.initDryRun);
    },
  );

  it.skipIf(process.env.CI === 'true' && process.platform === 'win32')(
    '`init` happy path completes under the init budget (1s target)',
    () => {
      // Pin --integration to claude-code so detection runs once,
      // not the full integration list. This matches a real "first-run"
      // moment-of-pain UX.
      const start = Date.now();
      const r = spawnSync(
        process.execPath,
        [BIN, 'init', '--repo', dir, '--yes', '--integration', 'claude-code'],
        { encoding: 'utf8' },
      );
      const elapsed = Date.now() - start;
      // init exit code is 0 even when integration is "not detected"
      // (it's reported as skipped, not an error).
      expect(r.status).toBe(0);
      expect(elapsed).toBeLessThan(BUDGETS.init);
    },
  );
});
