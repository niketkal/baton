import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __setSpawnForTests } from '../../src/claude-code/detect.js';
import { dryRun } from '../../src/claude-code/dry-run.js';

describe('claude-code dryRun', () => {
  let pluginDir: string;

  beforeEach(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'baton-dryrun-'));
    __setSpawnForTests((() => ({
      pid: 0,
      output: [],
      stdout: 'claude 2.4.1\n',
      stderr: '',
      status: 0,
      signal: null,
    })) as unknown as typeof import('node:child_process').spawnSync);
  });

  afterEach(() => {
    __setSpawnForTests(null);
    rmSync(pluginDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('returns a plan listing files that would be created and does not write to disk', async () => {
    const before = readdirSync(pluginDir);
    const plan = await dryRun({ pluginDir });
    expect(plan.integrationId).toBe('claude-code');
    expect(plan.mode).toBe('native-hook');
    expect(plan.filesCreated).toHaveLength(4);
    expect(plan.filesCreated.some((p) => p.endsWith('plugin.json'))).toBe(true);
    expect(plan.hookEvents).toEqual(['pre-compaction', 'session-end', 'limit-warning']);
    const after = readdirSync(pluginDir);
    expect(after).toEqual(before);
    // Sanity: tmp dir really is unchanged
    expect(statSync(pluginDir).isDirectory()).toBe(true);
  });
});
