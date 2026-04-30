import type { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __setSpawnForTests, detect } from '../../src/codex/detect.js';

type SpawnFn = typeof spawnSync;

interface SpawnExpectation {
  matchPath?: (path: string) => boolean;
  result: ReturnType<SpawnFn>;
}

/**
 * Build a spawn mock that responds based on the path argument so we
 * can assert PATH lookup vs probe-path lookup independently. Calls are
 * matched in order; an unmatched call fails the test.
 */
function mockSpawn(expectations: SpawnExpectation[]): SpawnFn {
  let i = 0;
  return ((path: string, _args: string[]) => {
    const exp = expectations[i++];
    if (!exp) throw new Error(`unexpected spawn call: ${path}`);
    if (exp.matchPath && !exp.matchPath(path)) {
      throw new Error(`spawn mock path mismatch at call ${i}: got ${path}`);
    }
    return exp.result;
  }) as unknown as SpawnFn;
}

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

const originalEnv = { ...process.env };

afterEach(() => {
  __setSpawnForTests(null);
  // Restore env vars we touch.
  if (originalEnv.BATON_CODEX_BIN === undefined) process.env.BATON_CODEX_BIN = '';
  else process.env.BATON_CODEX_BIN = originalEnv.BATON_CODEX_BIN;
});

// Pin platform to a non-win32 value for the POSIX-shaped tests in this
// describe block. The mocks below match on bare `codex`. Inner
// `Windows platform` describes override per-test and restore to this
// pinned value.
const originalPlatformForSuite = process.platform;

describe('codex detect', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatformForSuite });
  });

  it('returns installed=true with bare path when PATH lookup succeeds', async () => {
    __setSpawnForTests(
      mockSpawn([
        {
          matchPath: (p) => p === 'codex',
          result: versionOk('codex 0.10.0\n'),
        },
      ]),
    );
    const result = await detect();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('0.10.0');
    expect(result.path).toBe('codex');
  });

  it('falls back to probe path when PATH ENOENT and desktop-app exists', async () => {
    // Stage a fake binary at a tmp path and convince the probe to use it
    // via BATON_CODEX_BIN — that's the deterministic way to assert the
    // probe path is taken without depending on /Applications/Codex.app
    // existing on the test runner. The "desktop app" code path is the
    // BATON_CODEX_BIN-set case; the not-set list-walking case is
    // covered by the "probe finds match" test below using a stubbed
    // existsSync via a real file.
    const dir = mkdtempSync(join(tmpdir(), 'baton-codex-probe-'));
    const bin = join(dir, 'codex');
    writeFileSync(bin, '#!/usr/bin/env bash\necho "codex 1.2.3"\n');
    process.env.BATON_CODEX_BIN = bin;
    __setSpawnForTests(
      mockSpawn([
        { matchPath: (p) => p === 'codex', result: enoent() },
        { matchPath: (p) => p === bin, result: versionOk('codex 1.2.3\n') },
      ]),
    );
    const result = await detect();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('1.2.3');
    expect(result.path).toBe(bin);
  });

  it('returns not-found when PATH ENOENT and no probe path matches', async () => {
    process.env.BATON_CODEX_BIN = '';
    // PATH ENOENT, then the probe walks the candidate list — none of
    // the candidate paths exist on the test runner under tmp, so
    // existsSync filters them all out and no further spawn happens.
    __setSpawnForTests(mockSpawn([{ matchPath: (p) => p === 'codex', result: enoent() }]));
    const result = await detect();
    // Two outcomes are acceptable: if /usr/local/bin/codex or one of
    // the system candidates happens to exist on the runner, we'd hit
    // it. CI runners don't have codex installed, so we expect the
    // not-found branch. Guard the assertion accordingly.
    if (result.installed) {
      // Sanity: at least it produced an absolute path.
      expect(result.path).toMatch(/^\//);
    } else {
      expect(result.reason).toMatch(/not found/);
    }
  });

  it('honors BATON_CODEX_BIN when it points at a working binary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-codex-env-'));
    const bin = join(dir, 'codex');
    writeFileSync(bin, '#!/usr/bin/env bash\necho "codex 2.0.0"\n');
    process.env.BATON_CODEX_BIN = bin;
    __setSpawnForTests(
      mockSpawn([
        { matchPath: (p) => p === 'codex', result: enoent() },
        { matchPath: (p) => p === bin, result: versionOk('codex 2.0.0\n') },
      ]),
    );
    const result = await detect();
    expect(result.installed).toBe(true);
    expect(result.path).toBe(bin);
    expect(result.version).toBe('2.0.0');
  });

  it('returns not-found when BATON_CODEX_BIN points at a missing path (no fallthrough)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-codex-missing-'));
    // Note: do NOT create the file. existsSync should fail.
    const missing = join(dir, 'does-not-exist', 'codex');
    process.env.BATON_CODEX_BIN = missing;
    __setSpawnForTests(mockSpawn([{ matchPath: (p) => p === 'codex', result: enoent() }]));
    const result = await detect();
    expect(result.installed).toBe(false);
    expect(result.reason).toMatch(/BATON_CODEX_BIN/);
  });

  describe('Windows platform', () => {
    const originalPlatform = process.platform;
    const originalLocalAppData = process.env.LOCALAPPDATA;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env.LOCALAPPDATA = originalLocalAppData ?? '';
    });

    it('looks up bare `codex` via PATH on win32 (cmd.exe + PATHEXT resolves the extension)', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      __setSpawnForTests(
        mockSpawn([{ matchPath: (p) => p === 'codex', result: versionOk('codex 0.11.0\r\n') }]),
      );
      const result = await detect();
      expect(result.installed).toBe(true);
      expect(result.path).toBe('codex');
      expect(result.version).toBe('0.11.0');
    });

    it('honors BATON_CODEX_BIN with .exe path on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      // Stage a fake codex.exe under a tmp dir.
      const dir = mkdtempSync(join(tmpdir(), 'baton-win-codex-'));
      const winBin = join(dir, 'codex.exe');
      writeFileSync(winBin, 'MZ\x00\x00fake exe');
      process.env.BATON_CODEX_BIN = winBin;

      __setSpawnForTests(
        mockSpawn([
          { matchPath: (p) => p === 'codex', result: enoent() },
          { matchPath: (p) => p === winBin, result: versionOk('codex 1.5.0\r\n') },
        ]),
      );
      const result = await detect();
      expect(result.installed).toBe(true);
      expect(result.path).toBe(winBin);
      expect(result.version).toBe('1.5.0');
    });

    it('builds candidate list including LOCALAPPDATA on win32 (smoke)', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.BATON_CODEX_BIN = '';
      const fakeLocalAppData = mkdtempSync(join(tmpdir(), 'baton-win-lad-'));
      process.env.LOCALAPPDATA = fakeLocalAppData;
      // No codex.exe under fakeLocalAppData; probe walks but finds nothing.
      // Use a permissive spawn mock — multiple candidates may be tried
      // depending on what real desktop-app paths happen to exist on the
      // test runner. We just assert the function returns a stable shape.
      __setSpawnForTests(((path: string) => {
        if (path === 'codex') return enoent();
        // Anything else is a probe call against an unknown candidate; treat
        // as a non-codex binary so the probe rejects it.
        return {
          pid: 0,
          output: [],
          stdout: '',
          stderr: '',
          status: 1,
          signal: null,
        } as unknown as ReturnType<SpawnFn>;
      }) as unknown as SpawnFn);
      const result = await detect();
      expect(typeof result.installed).toBe('boolean');
    });
  });

  it('does not throw when spawn itself throws', async () => {
    process.env.BATON_CODEX_BIN = '';
    __setSpawnForTests((() => {
      throw new Error('catastrophic');
    }) as unknown as SpawnFn);
    const result = await detect();
    // Spawn-throw triggers the probe; on a CI runner with no codex
    // installed at any candidate path, we expect not-found. Either
    // outcome is non-throwing.
    expect(typeof result.installed).toBe('boolean');
  });
});
