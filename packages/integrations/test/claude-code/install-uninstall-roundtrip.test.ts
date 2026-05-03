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
  let settingsPath: string;

  beforeEach(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'baton-plugindir-'));
    repoRoot = mkdtempSync(join(tmpdir(), 'baton-repo-'));
    settingsPath = join(mkdtempSync(join(tmpdir(), 'baton-settings-')), 'settings.json');
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

  it('install creates plugin files + registers hooks in settings.json; uninstall reverses both', async () => {
    const before = dirFingerprint(pluginDir);

    const result = await install({ pluginDir, repoRoot, settingsPath });
    expect(result.plan.integrationId).toBe('claude-code');
    expect(result.plan.filesCreated.length).toBe(4);
    expect(result.plan.filesModified).toContain(settingsPath);
    expect(result.plan.fallbackUsed).toBe(false);

    const created = dirFingerprint(pluginDir);
    expect(created).not.toBe(before);

    // Confirm hook scripts exist
    const batonDir = join(pluginDir, 'baton');
    expect(statSync(join(batonDir, 'plugin.json')).isFile()).toBe(true);
    expect(statSync(join(batonDir, 'hooks', 'pre-compact.sh')).isFile()).toBe(true);
    expect(statSync(join(batonDir, 'hooks', 'stop.sh')).isFile()).toBe(true);
    expect(statSync(join(batonDir, 'hooks', 'session-end.sh')).isFile()).toBe(true);

    // Confirm settings.json now has the three hook events pointing at
    // the absolute script paths we just installed. Without these
    // entries Claude Code never fires the hooks.
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
    };
    expect(Object.keys(settings.hooks ?? {}).sort()).toEqual(['PreCompact', 'SessionEnd', 'Stop']);
    const preCompactCmd = settings.hooks?.PreCompact?.[0]?.hooks?.[0]?.command ?? '';
    expect(preCompactCmd).toBe(join(batonDir, 'hooks', 'pre-compact.sh'));

    await uninstall({ repoRoot });
    const after = dirFingerprint(pluginDir);
    expect(after).toBe(before);

    // Settings.json should no longer contain baton's hook entries.
    // The file may or may not exist depending on whether removing our
    // hooks left it empty; in this test it was created fresh, so the
    // hooks key should be gone.
    if (statSync(settingsPath, { throwIfNoEntry: false })) {
      const afterSettings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
        hooks?: Record<string, unknown>;
      };
      expect(afterSettings.hooks).toBeUndefined();
    }
  });
});
