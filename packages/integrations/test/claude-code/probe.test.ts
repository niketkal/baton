import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { probePluginDir } from '../../src/claude-code/probe.js';

describe('claude-code probePluginDir', () => {
  let dir: string;
  let homeRestore: string | undefined;
  let userProfileRestore: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-probe-'));
    homeRestore = process.env.HOME;
    userProfileRestore = process.env.USERPROFILE;
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
  });

  afterEach(() => {
    if (homeRestore !== undefined) process.env.HOME = homeRestore;
    else process.env.HOME = '';
    if (userProfileRestore !== undefined) process.env.USERPROFILE = userProfileRestore;
    else process.env.USERPROFILE = '';
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('returns ~/.claude/plugins when it exists and is writable', async () => {
    const target = join(dir, '.claude', 'plugins');
    mkdirSync(target, { recursive: true });
    const result = await probePluginDir('2.0.0');
    expect(result).toBe(target);
  });

  it('returns the path even if the plugin dir does not exist yet, as long as parent exists', async () => {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    const result = await probePluginDir('2.0.0');
    expect(result).toBe(join(dir, '.claude', 'plugins'));
  });

  it('falls back to ~/.config/claude/plugins when the primary candidate is unavailable', async () => {
    mkdirSync(join(dir, '.config', 'claude'), { recursive: true });
    const result = await probePluginDir('2.0.0');
    expect(result).toBe(join(dir, '.config', 'claude', 'plugins'));
  });

  it('returns null when no candidate parent exists', async () => {
    const result = await probePluginDir('2.0.0');
    expect(result).toBeNull();
  });
});
