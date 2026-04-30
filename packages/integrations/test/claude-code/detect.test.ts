import type { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { __setSpawnForTests, detect } from '../../src/claude-code/detect.js';

type SpawnFn = typeof spawnSync;

const enoent = (): ReturnType<SpawnFn> => {
  const err = new Error('spawn ENOENT') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return {
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
    status: null,
    signal: null,
    error: err,
  } as unknown as ReturnType<SpawnFn>;
};

const versionOk = (line: string): ReturnType<SpawnFn> =>
  ({
    pid: 0,
    output: [],
    stdout: line,
    stderr: '',
    status: 0,
    signal: null,
  }) as unknown as ReturnType<SpawnFn>;

interface SpawnExpectation {
  matchPath?: (path: string) => boolean;
  result: ReturnType<SpawnFn>;
}

function mockSpawn(expectations: SpawnExpectation[]): SpawnFn {
  let i = 0;
  return ((path: string) => {
    const exp = expectations[i++];
    if (!exp) throw new Error(`unexpected spawn call: ${path}`);
    if (exp.matchPath && !exp.matchPath(path)) {
      throw new Error(`spawn mock path mismatch at call ${i}: got ${path}`);
    }
    return exp.result;
  }) as unknown as SpawnFn;
}

const originalEnv = { ...process.env };

afterEach(() => {
  __setSpawnForTests(null);
  if (originalEnv.BATON_CLAUDE_BIN === undefined) process.env.BATON_CLAUDE_BIN = '';
  else process.env.BATON_CLAUDE_BIN = originalEnv.BATON_CLAUDE_BIN;
});

describe('claude-code detect', () => {
  it('returns installed=true with parsed semver when claude --version succeeds', async () => {
    __setSpawnForTests(
      mockSpawn([{ matchPath: (p) => p === 'claude', result: versionOk('claude 2.4.1\n') }]),
    );
    const result = await detect();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('2.4.1');
    expect(result.path).toBe('claude');
  });

  it('falls back to probe when PATH ENOENT and no candidate matches', async () => {
    process.env.BATON_CLAUDE_BIN = '';
    __setSpawnForTests(mockSpawn([{ matchPath: (p) => p === 'claude', result: enoent() }]));
    const result = await detect();
    if (result.installed) {
      expect(result.path).toMatch(/^\//);
    } else {
      expect(result.reason).toMatch(/not found/);
    }
  });

  it('returns installed=false when version output cannot be parsed', async () => {
    __setSpawnForTests(
      mockSpawn([{ matchPath: (p) => p === 'claude', result: versionOk('no version here') }]),
    );
    const result = await detect();
    expect(result.installed).toBe(false);
    expect(result.reason).toMatch(/parse/);
  });

  it('honors BATON_CLAUDE_BIN when it points at a working binary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-claude-env-'));
    const bin = join(dir, 'claude');
    writeFileSync(bin, '#!/usr/bin/env bash\necho "claude 1.0.0"\n');
    process.env.BATON_CLAUDE_BIN = bin;
    __setSpawnForTests(
      mockSpawn([
        { matchPath: (p) => p === 'claude', result: enoent() },
        { matchPath: (p) => p === bin, result: versionOk('claude 1.0.0\n') },
      ]),
    );
    const result = await detect();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('1.0.0');
    expect(result.path).toBe(bin);
  });

  it('returns not-found when BATON_CLAUDE_BIN points at a missing path (no fallthrough)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-claude-missing-'));
    const missing = join(dir, 'does-not-exist', 'claude');
    process.env.BATON_CLAUDE_BIN = missing;
    __setSpawnForTests(mockSpawn([{ matchPath: (p) => p === 'claude', result: enoent() }]));
    const result = await detect();
    expect(result.installed).toBe(false);
    expect(result.reason).toMatch(/BATON_CLAUDE_BIN/);
  });

  describe('Windows platform', () => {
    const originalPlatform = process.platform;
    const originalLocalAppData = process.env.LOCALAPPDATA;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env.LOCALAPPDATA = originalLocalAppData ?? '';
    });

    it('looks for claude.exe via PATH first on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      __setSpawnForTests(
        mockSpawn([
          { matchPath: (p) => p === 'claude.exe', result: versionOk('claude 2.5.0\r\n') },
        ]),
      );
      const result = await detect();
      expect(result.installed).toBe(true);
      expect(result.path).toBe('claude.exe');
      expect(result.version).toBe('2.5.0');
    });

    it('probes LOCALAPPDATA Programs path when PATH misses on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.BATON_CLAUDE_BIN = '';
      const fakeLocalAppData = mkdtempSync(join(tmpdir(), 'baton-win-claude-'));
      const programsDir = join(fakeLocalAppData, 'Programs', 'Claude');
      const { mkdirSync } = await import('node:fs');
      mkdirSync(programsDir, { recursive: true });
      const winBin = join(programsDir, 'claude.exe');
      writeFileSync(winBin, 'MZ\x00\x00fake exe');
      process.env.LOCALAPPDATA = fakeLocalAppData;

      __setSpawnForTests(
        mockSpawn([
          { matchPath: (p) => p === 'claude.exe', result: enoent() },
          { matchPath: (p) => p === 'claude', result: enoent() },
          { matchPath: (p) => p === winBin, result: versionOk('claude 2.6.0\r\n') },
        ]),
      );
      const result = await detect();
      expect(result.installed).toBe(true);
      expect(result.path).toBe(winBin);
      expect(result.version).toBe('2.6.0');
    });
  });

  it('does not throw when spawn itself throws', async () => {
    process.env.BATON_CLAUDE_BIN = '';
    __setSpawnForTests((() => {
      throw new Error('catastrophic');
    }) as unknown as SpawnFn);
    const result = await detect();
    expect(typeof result.installed).toBe('boolean');
  });
});
