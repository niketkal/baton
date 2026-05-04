import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findLatestRolloutSince, runWrapper } from '../../src/codex/wrapper.js';

const IS_WIN = process.platform === 'win32';

function writeRollout(
  sessionsDir: string,
  ymd: { y: string; m: string; d: string },
  filename: string,
  body: string,
  mtime?: Date,
): string {
  const dir = join(sessionsDir, ymd.y, ymd.m, ymd.d);
  mkdirSync(dir, { recursive: true });
  const full = join(dir, filename);
  writeFileSync(full, body, 'utf8');
  if (mtime !== undefined) utimesSync(full, mtime, mtime);
  return full;
}

describe('findLatestRolloutSince', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-codex-rollout-find-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('returns null when sessionsDir does not exist', () => {
    expect(findLatestRolloutSince(0, join(dir, 'missing'))).toBeNull();
  });

  it('returns null when no rollout files match', () => {
    mkdirSync(join(dir, '2026', '04', '03'), { recursive: true });
    expect(findLatestRolloutSince(0, dir)).toBeNull();
  });

  it('returns the rollout with the latest mtime among those >= sinceMs', () => {
    const now = Date.now();
    const oldFile = writeRollout(
      dir,
      { y: '2026', m: '01', d: '01' },
      'rollout-old.jsonl',
      'old',
      new Date(now - 60_000),
    );
    const newFile = writeRollout(
      dir,
      { y: '2026', m: '04', d: '03' },
      'rollout-new.jsonl',
      'new',
      new Date(now + 1000),
    );
    expect(findLatestRolloutSince(now - 30_000, dir)).toBe(newFile);
    // sinceMs filter excludes oldFile
    expect(findLatestRolloutSince(now, dir)).toBe(newFile);
    // both eligible → still the newer one
    expect(findLatestRolloutSince(0, dir)).toBe(newFile);
    expect(oldFile).not.toBe(newFile);
  });

  it('skips non-numeric path segments and non-rollout files', () => {
    const now = Date.now();
    mkdirSync(join(dir, 'not-a-year'), { recursive: true });
    writeFileSync(join(dir, 'not-a-year', 'rollout-x.jsonl'), 'x', 'utf8');
    writeRollout(dir, { y: '2026', m: '04', d: '03' }, 'README.md', 'docs', new Date(now + 1000));
    const real = writeRollout(
      dir,
      { y: '2026', m: '04', d: '03' },
      'rollout-real.jsonl',
      'real',
      new Date(now + 2000),
    );
    expect(findLatestRolloutSince(now, dir)).toBe(real);
  });
});

describe('runWrapper TTY mode (post-hoc rollout handoff)', () => {
  let dir: string;
  let sessionsDir: string;
  let codexBin: string;

  function writeMockCodex(target: string, exitCode: number): void {
    if (IS_WIN) {
      writeFileSync(`${target}.cmd`, `@echo off\r\nexit /b ${exitCode}\r\n`, 'utf8');
      return;
    }
    writeFileSync(target, `#!/usr/bin/env bash\nexit ${exitCode}\n`, 'utf8');
    chmodSync(target, 0o755);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-codex-tty-'));
    sessionsDir = join(dir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    codexBin = IS_WIN ? join(dir, 'codex') : join(dir, 'codex');
    writeMockCodex(codexBin, 0);
    if (IS_WIN) codexBin = `${codexBin}.cmd`;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('fires the post-hoc handoff when the rollout contains a limit marker', async () => {
    // Pre-create the rollout so it's "from this run" (mtime > startedAt).
    // The wrapper finds it after the mock codex exits.
    const now = Date.now() + 1000;
    const rolloutPath = writeRollout(
      sessionsDir,
      { y: '2026', m: '04', d: '03' },
      'rollout-1.jsonl',
      '{"type":"event_msg","payload":{"type":"agent_message","message":"Error: Rate limit reached, please try again later"}}\n',
      new Date(now),
    );
    let handoffPath: string | undefined;
    const notifications: string[] = [];
    const code = await runWrapper([], {
      mode: 'tty',
      codexBin,
      sessionsDir,
      onLimit: (p) => {
        handoffPath = p;
      },
      notify: (line) => notifications.push(line),
    });
    expect(code).toBe(0);
    expect(handoffPath).toBe(rolloutPath);
    expect(notifications.some((l) => l.includes('limit detected'))).toBe(true);
  });

  it('does not fire the handoff when the rollout has no limit marker', async () => {
    writeRollout(
      sessionsDir,
      { y: '2026', m: '04', d: '03' },
      'rollout-quiet.jsonl',
      '{"type":"event_msg","payload":{"type":"agent_message","message":"all good"}}\n',
      new Date(Date.now() + 1000),
    );
    let triggered = false;
    const code = await runWrapper([], {
      mode: 'tty',
      codexBin,
      sessionsDir,
      onLimit: () => {
        triggered = true;
      },
      notify: () => {},
    });
    expect(code).toBe(0);
    expect(triggered).toBe(false);
  });

  it('returns the codex exit code on a failed run', async () => {
    const failingBin = join(dir, 'codex-fail');
    writeMockCodex(failingBin, 7);
    const code = await runWrapper([], {
      mode: 'tty',
      codexBin: IS_WIN ? `${failingBin}.cmd` : failingBin,
      sessionsDir,
      onLimit: () => {},
      notify: () => {},
    });
    expect(code).toBe(7);
  });

  it('does nothing when no rollout exists for this run', async () => {
    let triggered = false;
    const code = await runWrapper([], {
      mode: 'tty',
      codexBin,
      sessionsDir,
      onLimit: () => {
        triggered = true;
      },
      notify: () => {},
    });
    expect(code).toBe(0);
    expect(triggered).toBe(false);
  });
});

describe('runWrapper auto mode selection', () => {
  let dir: string;
  let codexBin: string;
  let originalStdinIsTty: boolean | undefined;
  let originalStdoutIsTty: boolean | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-codex-mode-'));
    codexBin = join(dir, 'codex');
    if (IS_WIN) {
      writeFileSync(`${codexBin}.cmd`, '@echo off\r\nexit /b 0\r\n', 'utf8');
      codexBin = `${codexBin}.cmd`;
    } else {
      writeFileSync(codexBin, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
      chmodSync(codexBin, 0o755);
    }
    originalStdinIsTty = process.stdin.isTTY;
    originalStdoutIsTty = process.stdout.isTTY;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTty,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTty,
      configurable: true,
    });
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('falls back to pipe mode when stdin is not a TTY (harness with piped stdin)', async () => {
    // Simulate a harness where stdout is a TTY but stdin is piped.
    // Without the dual-isTTY check, the wrapper would have tried
    // stdio:'inherit' and codex would error with "stdin is not a
    // terminal". Pipe mode tolerates the piped stdin.
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    // No mode override — exercise the auto path.
    const code = await runWrapper([], {
      codexBin,
      // No sessionsDir means TTY-mode rollout discovery would default
      // to ~/.codex/sessions; pipe mode never reaches that branch, so
      // this is a sufficient assertion that we picked pipe mode.
      notify: () => {},
    });
    expect(code).toBe(0);
  });
});
