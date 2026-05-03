import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __setSpawnForTests } from '../../src/claude-code/detect.js';
import { install } from '../../src/claude-code/install.js';
import { uninstall } from '../../src/claude-code/uninstall.js';

/**
 * Walk `root` recursively and return a sha256 over the sorted list of
 * (relative-path, file-content-hash) pairs. Used to verify the
 * install/uninstall roundtrip leaves the plugin dir byte-for-byte
 * identical.
 */
function dirFingerprint(root: string): string {
  if (!statSync(root, { throwIfNoEntry: false })) return 'EMPTY';
  const entries: string[] = [];
  function walk(p: string) {
    for (const name of readdirSync(p).sort()) {
      const full = join(p, name);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else {
        const rel = relative(root, full).split(sep).join('/');
        const fileHash = createHash('sha256').update(readFileSync(full)).digest('hex');
        entries.push(`${rel}\0${fileHash}`);
      }
    }
  }
  walk(root);
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

describe('claude-code install/uninstall roundtrip (week-4 gate)', () => {
  let pluginDir: string;
  let repoRoot: string;

  beforeEach(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'baton-plugindir-'));
    repoRoot = mkdtempSync(join(tmpdir(), 'baton-repo-'));
    // Stub detect so we don't need a real `claude` binary in CI.
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
    rmSync(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('install creates plugin files and uninstall restores the dir byte-for-byte', async () => {
    const before = dirFingerprint(pluginDir);

    const result = await install({ pluginDir, repoRoot });
    expect(result.plan.integrationId).toBe('claude-code');
    expect(result.plan.filesCreated.length).toBe(4);
    expect(result.plan.fallbackUsed).toBe(false);

    const created = dirFingerprint(pluginDir);
    expect(created).not.toBe(before);

    // Confirm hook scripts exist
    const batonDir = join(pluginDir, 'baton');
    expect(statSync(join(batonDir, 'plugin.json')).isFile()).toBe(true);
    expect(statSync(join(batonDir, 'hooks', 'pre-compact.sh')).isFile()).toBe(true);
    expect(statSync(join(batonDir, 'hooks', 'stop.sh')).isFile()).toBe(true);
    expect(statSync(join(batonDir, 'hooks', 'session-end.sh')).isFile()).toBe(true);

    await uninstall({ repoRoot });
    const after = dirFingerprint(pluginDir);
    expect(after).toBe(before);
  });
});
