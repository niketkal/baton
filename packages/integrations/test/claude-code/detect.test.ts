import { afterEach, describe, expect, it } from 'vitest';
import { __setSpawnForTests, detect } from '../../src/claude-code/detect.js';

afterEach(() => {
  __setSpawnForTests(null);
});

describe('claude-code detect', () => {
  it('returns installed=true with parsed semver when claude --version succeeds', async () => {
    __setSpawnForTests((() => ({
      pid: 0,
      output: [],
      stdout: 'claude 2.4.1 (build 1234)\n',
      stderr: '',
      status: 0,
      signal: null,
    })) as unknown as typeof import('node:child_process').spawnSync);
    const result = await detect();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('2.4.1');
  });

  it('returns installed=false when binary is missing (ENOENT)', async () => {
    __setSpawnForTests((() => {
      const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      return {
        pid: 0,
        output: [],
        stdout: '',
        stderr: '',
        status: null,
        signal: null,
        error: err,
      };
    }) as unknown as typeof import('node:child_process').spawnSync);
    const result = await detect();
    expect(result.installed).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });

  it('returns installed=false when version output cannot be parsed', async () => {
    __setSpawnForTests((() => ({
      pid: 0,
      output: [],
      stdout: 'no version here',
      stderr: '',
      status: 0,
      signal: null,
    })) as unknown as typeof import('node:child_process').spawnSync);
    const result = await detect();
    expect(result.installed).toBe(false);
    expect(result.reason).toMatch(/parse/);
  });

  it('does not throw when spawn itself throws', async () => {
    __setSpawnForTests((() => {
      throw new Error('catastrophic');
    }) as unknown as typeof import('node:child_process').spawnSync);
    const result = await detect();
    expect(result.installed).toBe(false);
  });
});
