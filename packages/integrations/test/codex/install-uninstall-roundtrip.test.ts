import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { install } from '../../src/codex/install.js';
import { shimContentForPlatform, shimFilenameForPlatform } from '../../src/codex/shim.js';
import { uninstall } from '../../src/codex/uninstall.js';

const SHIM_FILENAME = shimFilenameForPlatform();
const SHIM_CONTENT = shimContentForPlatform();

function dirFingerprint(root: string): string {
  if (!statSync(root, { throwIfNoEntry: false })) return 'EMPTY';
  const entries: string[] = [];
  function walk(p: string) {
    for (const name of readdirSync(p).sort()) {
      const full = join(p, name);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else {
        const rel = relative(root, full).split(sep).join('/');
        const h = createHash('sha256').update(readFileSync(full)).digest('hex');
        entries.push(`${rel}\0${h}`);
      }
    }
  }
  walk(root);
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

describe('codex shim install/uninstall roundtrip', () => {
  let installDir: string;
  let repoRoot: string;

  beforeEach(() => {
    installDir = mkdtempSync(join(tmpdir(), 'baton-codex-bin-'));
    repoRoot = mkdtempSync(join(tmpdir(), 'baton-codex-repo-'));
  });

  afterEach(() => {
    rmSync(installDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    rmSync(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('install creates the shim, uninstall removes it byte-for-byte', async () => {
    const before = dirFingerprint(installDir);

    const r = await install({ pluginDir: installDir, repoRoot });
    expect(r.plan.integrationId).toBe('codex');
    expect(r.plan.mode).toBe('wrapper-launcher');
    expect(r.plan.filesCreated.length).toBe(1);

    const shimPath = join(installDir, SHIM_FILENAME);
    expect(statSync(shimPath).isFile()).toBe(true);
    expect(readFileSync(shimPath, 'utf8')).toBe(SHIM_CONTENT);

    expect(dirFingerprint(installDir)).not.toBe(before);

    await uninstall({ repoRoot });
    expect(dirFingerprint(installDir)).toBe(before);
  });

  it('uninstall is a no-op when nothing was installed', async () => {
    await uninstall({ repoRoot });
    // No throw; manifest never created.
    expect(true).toBe(true);
  });

  it('install picks platform-appropriate shim filename + content', async () => {
    await install({ pluginDir: installDir, repoRoot });
    const expectedName = process.platform === 'win32' ? 'baton-codex.cmd' : 'baton-codex';
    expect(SHIM_FILENAME).toBe(expectedName);
    const shimPath = join(installDir, expectedName);
    expect(statSync(shimPath).isFile()).toBe(true);
    const content = readFileSync(shimPath, 'utf8');
    if (process.platform === 'win32') {
      expect(content).toMatch(/@echo off/);
      expect(content).toMatch(/baton internal codex-wrap %\*/);
    } else {
      expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
      expect(content).toMatch(/exec baton internal codex-wrap/);
    }
  });

  it('uninstall leaves user-edited shims alone (sha256 mismatch)', async () => {
    await install({ pluginDir: installDir, repoRoot });
    const shimPath = join(installDir, SHIM_FILENAME);
    // Simulate user edit.
    const { writeFileSync } = await import('node:fs');
    writeFileSync(shimPath, '#!/bin/sh\necho user-edited\n', 'utf8');

    await uninstall({ repoRoot });
    // The user-edited shim must still be there.
    expect(statSync(shimPath).isFile()).toBe(true);
    expect(readFileSync(shimPath, 'utf8')).toContain('user-edited');
  });
});
